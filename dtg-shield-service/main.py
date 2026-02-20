"""
DTG Shield Service
==================

Autonomous Enterprise Security Gateway.
Uses Redis to sync risk limits across backend and biometric processes.
Heuristically analyzes and proxies traffic safely.
"""

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
import httpx
import uvicorn
import time
import json
import asyncio
import re
from config import config
from risk_engine import RiskEngine

app = FastAPI(title="DTG Shield Service", version="1.0.0")
risk_engine = RiskEngine()

# Initialize HTTP client for proxying
client = httpx.AsyncClient(base_url=config.BACKEND_URL, timeout=30.0)

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
    # 1. Get Client IP safely
    client_ip = request.client.host
    if "x-forwarded-for" in request.headers:
        client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        
    # 2. Heuristic Analysis - Check if blocked by Shield Risk Engine
    start_time = time.time()
    
    is_blocked, reason = await risk_engine.is_ip_blocked(client_ip)
    
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

# WAF-lite Patterns
SQLI_PATTERNS = re.compile(r"(union|select|insert|update|delete|drop|admin|'|--|#|/\*|\*/)", re.IGNORECASE)
XSS_PATTERNS = re.compile(r"(<script|alert\(|onerror=|javascript:|onload=)", re.IGNORECASE)
TRAVERSAL_PATTERNS = re.compile(r"(\.\./|\.\.\\|/etc/passwd|/windows/|/boot/)", re.IGNORECASE)

async def check_malicious_content(content: str) -> bool:
    """Checks if content contains common attack patterns."""
    if not content: return False
    return bool(SQLI_PATTERNS.search(content) or XSS_PATTERNS.search(content) or TRAVERSAL_PATTERNS.search(content))

@app.middleware("http")
async def waf_middleware(request: Request, call_next):
    client_ip = request.client.host
    if "x-forwarded-for" in request.headers:
        client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()

    # Check URL path and query params
    if await check_malicious_content(str(request.url)):
        print(f"[WAF] Blocked malicious URL attempt from {client_ip}")
        await risk_engine.increment_risk(client_ip, 50, "WAF: Malicious URL Pattern")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Rejected by DTG Shield [WAF]", "detail": "Malicious payload detected"}
        )

    # Note: Body inspection is harder for streaming proxies, 
    # but for simulation we'll check smaller non-file bodies if they are application/json
    if request.method in ["POST", "PUT"]:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                # We consume a bit of the body for inspection. 
                # WARNING: In production this requires careful buffering to not break the proxy stream.
                # For this MVP simulation, we'll implement a simple one.
                body_bytes = await request.body()
                body_str = body_bytes.decode("utf-8", errors="ignore")
                if await check_malicious_content(body_str):
                    print(f"[WAF] Blocked malicious Body payload from {client_ip}")
                    await risk_engine.increment_risk(client_ip, 75, "WAF: Malicious Body Pattern")
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"error": "Rejected by DTG Shield [WAF]", "detail": "Malicious payload detected"}
                    )
                
                # Re-wrap body for the proxy since we consumed it
                request._body = body_bytes
            except Exception:
                pass # Continue if body read fails

    return await call_next(request)

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
    excluded_headers = ["host", "content-length"]
    headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_headers}
    headers["x-forwarded-for"] = request.client.host

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
                
        # Filter response headers
        resp_headers = {k: v for k, v in target_resp.headers.items() if k.lower() not in ["content-encoding", "content-length", "transfer-encoding"]}
                
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
