"""
DTG Shield Service
==================

Autonomous Enterprise Security Gateway.
Uses Redis to sync risk limits across backend and biometric processes.
Heuristically analyzes and proxies traffic safely.
"""

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from ipaddress import ip_address, ip_network
import httpx
import uvicorn
import time
import json
import asyncio
from config import config
from risk_engine import RiskEngine

app = FastAPI(title="DTG Shield Service", version="1.0.0")
risk_engine = RiskEngine()

# Initialize HTTP client for proxying
client = httpx.AsyncClient(base_url=config.BACKEND_URL, timeout=30.0)


def resolve_client_ip(request: Request, trusted_proxy_cidrs: str | None = None) -> str:
    """Resolve client IP while rejecting caller-forged forwarding headers."""
    peer = request.client.host if request.client else "unknown"
    try:
        peer_address = ip_address(peer)
    except ValueError:
        return peer

    raw_cidrs = config.TRUSTED_PROXY_CIDRS if trusted_proxy_cidrs is None else trusted_proxy_cidrs
    try:
        trusted_networks = tuple(
            ip_network(value.strip(), strict=False)
            for value in raw_cidrs.split(",")
            if value.strip()
        )
    except ValueError:
        return str(peer_address)

    def is_trusted(address) -> bool:
        return any(address in network for network in trusted_networks)

    if not trusted_networks or not is_trusted(peer_address):
        return str(peer_address)

    cloudflare_address = request.headers.get("cf-connecting-ip", "").strip()
    if cloudflare_address:
        try:
            return str(ip_address(cloudflare_address))
        except ValueError:
            return str(peer_address)

    forwarded_chain = request.headers.get("x-forwarded-for", "")
    if forwarded_chain:
        try:
            addresses = [ip_address(value.strip()) for value in forwarded_chain.split(",")]
        except ValueError:
            return str(peer_address)

        for address in reversed(addresses):
            if not is_trusted(address):
                return str(address)
        if addresses:
            return str(addresses[0])

    return str(peer_address)

@app.on_event("startup")
async def startup_event():
    print(f"Starting Shield Service on port {config.PORT}")
    await risk_engine.connect()
    print("Risk Engine connected to Redis.")

@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()
    await risk_engine.disconnect()

@app.middleware("http")
async def shield_middleware(request: Request, call_next):
    client_ip = resolve_client_ip(request)

    # 2. Heuristic Analysis - Check if blocked by Shield Risk Engine
    start_time = time.time()
    
    is_blocked, reason = await risk_engine.is_ip_blocked(client_ip, request=request)
    
    if is_blocked:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Access Denied by DTG Shield", "reason": reason},
            headers={"X-Shield-Blocked": "true"}
        )

    # 3. Process Request
    response = await call_next(request)
    
    # 4. Post-processing Response Analytics
    latency_ms = int((time.time() - start_time) * 1000)
    
    # Analyze rate limit headers from backend to dynamically adjust risk
    if response.status_code == 429:
        await risk_engine.increment_risk(client_ip, config.AUTH_FAIL_WEIGHT, "Backend 429 Rate Limit")
    elif request.url.path.startswith("/api/v1/auth") and response.status_code == 401:
        await risk_engine.increment_risk(client_ip, config.AUTH_FAIL_WEIGHT, "Auth Failure")
        
    response.headers["X-Shield-Latency"] = str(latency_ms)
    return response

@app.get("/health")
async def health_check():
    backend_status = "unknown"
    try:
        res = await client.get("/health", timeout=2.0)
        backend_status = "ok" if res.status_code == 200 else "degraded"
    except Exception:
        backend_status = "unreachable"
        
    return {
        "shield_status": "active",
        "backend_status": backend_status,
        "active_blocks": await risk_engine.get_block_count()
    }

# Wildcard route for Proxying all requests to Backend
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy(request: Request, path: str):
    url = httpx.URL(path=request.url.path, query=request.url.query.encode("utf-8"))
    
    # Filter headers
    excluded_headers = {
        "host", "content-length", "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
        "forwarded", "x-forwarded-for", "x-forwarded-proto", "cf-connecting-ip",
    }
    headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_headers}
    headers["x-forwarded-for"] = resolve_client_ip(request)
    headers["x-forwarded-proto"] = request.url.scheme
    # Force uncompressed responses: the shield cannot re-encode compressed bodies,
    # so we tell the backend to send plain text to avoid zstd/gzip decode issues.
    headers["accept-encoding"] = "identity"

    try:
        # Stream the request body
        async def stream_body():
            async for chunk in request.stream():
                yield chunk
                
        req = client.build_request(
            request.method,
            url,
            headers=headers,
            content=stream_body()
        )
        
        target_resp = await client.send(req, stream=True)
        
        async def stream_response():
            async for chunk in target_resp.aiter_bytes():
                yield chunk
                
        # Hop-by-hop headers belong to the backend connection and must never be
        # forwarded across the gateway boundary. StreamingResponse recomputes
        # framing for the client connection.
        response_excluded_headers = {
            "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade", "content-length",
        }
        resp_headers = {
            key: value
            for key, value in target_resp.headers.items()
            if key.lower() not in response_excluded_headers
        }
                
        return StreamingResponse(
            stream_response(),
            status_code=target_resp.status_code,
            headers=resp_headers,
            background=target_resp.aclose
        )
            
    except httpx.RequestError as e:
        print(f"Proxy error: {e}")
        raise HTTPException(status_code=502, detail="Bad Gateway")

if __name__ == "__main__":
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
