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
    # 1. Get Client IP — prefer CF-Connecting-IP (Cloudflare sets this and
    #    strips any client-forged version), then fall back to X-Forwarded-For,
    #    then the raw TCP socket address.
    client_ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.client.host
    )

    # ── ADMIN BYPASS ────────────────────────────────────────────────────────
    # Authenticated admin routes and the admin login endpoint bypass all
    # Shield risk/geo/VPN checks. The backend's requireAdmin middleware still
    # enforces valid JWT authentication, so there is no security gap.
    ADMIN_PATHS = ["/api/v1/admin/"]
    is_admin_path = any(request.url.path.startswith(p) for p in ADMIN_PATHS)
    if is_admin_path:
        response = await call_next(request)
        response.headers["X-Shield-Bypass"] = "admin"
        return response
    # ── END ADMIN BYPASS ─────────────────────────────────────────────────────

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
    excluded_headers = ["host", "content-length"]
    headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_headers}
    headers["x-forwarded-for"] = request.client.host
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
                
        # Filter response headers — keep content-encoding so browser can decompress if needed
        # Only strip transfer-encoding and content-length (recomputed by StreamingResponse)
        resp_headers = {k: v for k, v in target_resp.headers.items() if k.lower() not in ["content-length", "transfer-encoding"]}
                
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
