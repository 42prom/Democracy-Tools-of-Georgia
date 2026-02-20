import redis.asyncio as redis
from datetime import datetime
from config import config
import json


class RiskEngine:
    def __init__(self):
        self.redis = None
        self.block_threshold = config.BLOCK_THRESHOLD

    async def connect(self):
        self.redis = await redis.from_url(config.REDIS_URL, decode_responses=True)

    async def disconnect(self):
        if self.redis:
            await self.redis.close()

    # =========================================================================
    # RISK SCORING
    # =========================================================================

    async def increment_risk(self, ip: str, amount: int, reason: str):
        """Increments risk score for an IP based on heuristic triggers."""
        key = f"shield:risk:{ip}"

        current = await self.redis.incrby(key, amount)
        await self.redis.expire(key, 3600)  # Reset risk after 1 hour of inactivity

        # Log reason for dashboard
        log_key = f"shield:logs:{ip}"
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "amount": amount,
            "reason": reason,
            "total_score": current
        }
        await self.redis.lpush(log_key, json.dumps(log_entry))
        await self.redis.ltrim(log_key, 0, 49)  # Keep last 50 events

        # Auto-block if threshold reached
        if current >= self.block_threshold:
            await self.block_ip(ip, f"Risk score exceeded: {current}")

    async def block_ip(self, ip: str, reason: str, duration_sec: int = 3600):
        """Applies a hard block to an IP and updates the O(1) block counter."""
        block_key = f"shield:block:{ip}"
        # Only increment counter if this IP isn't already blocked
        already_blocked = await self.redis.exists(block_key)
        await self.redis.setex(block_key, duration_sec, reason)
        if not already_blocked:
            await self.redis.incr("shield:block_count")
        print(f"[SHIELD] BLOCKED IP {ip}: {reason}")

    # =========================================================================
    # MASTER BLOCK CHECK
    # Layered in priority order:
    # 1. Shield direct block (highest priority)
    # 2. Geo-Blocking (synced from Admin Geo-Blocking page)
    # 3. Security Policies (synced from Admin Security Policies page)
    # 4. Backend rate limit heuristics
    # =========================================================================

    async def is_ip_blocked(self, ip: str, request=None) -> tuple[bool, str]:
        """Checks if an IP is blocked using all synchronized policy layers."""

        # --- LAYER 1: Shield Direct Block ---
        reason = await self.redis.get(f"shield:block:{ip}")
        if reason:
            return True, f"Shield Risk Block: {reason}"

        # --- LAYER 2: Geo-Blocking (synced from Admin Geo-Blocking page) ---
        try:
            geo_settings_raw = await self.redis.get("geo:settings")
            if geo_settings_raw:
                geo_settings = json.loads(geo_settings_raw)
                if geo_settings.get("geo_blocking_enabled") == "true":
                    blocked_countries_raw = await self.redis.get("geo:blocked_countries")
                    if blocked_countries_raw:
                        blocked_countries = json.loads(blocked_countries_raw)
                        if blocked_countries:  # Only check if there are actual blocked countries
                            country_code = await self._get_country_code(ip)
                            if country_code and country_code.upper() in [c.upper() for c in blocked_countries]:
                                print(f"[SHIELD] GEO-BLOCKED: {ip} from {country_code}")
                                return True, f"Geo-Blocked: {country_code} is restricted"
        except Exception as e:
            print(f"[SHIELD] Geo-sync error: {e}")

        # --- LAYER 3: Security Policies (synced from Admin Security Policies page) ---
        try:
            sec_settings_raw = await self.redis.get("security:settings")
            if sec_settings_raw:
                sec_settings = json.loads(sec_settings_raw)

                # 3a. Device Attestation check (Root/Jailbreak)
                if sec_settings.get("require_device_attestation") == "true":
                    if request is not None:
                        attestation_token = request.headers.get("x-attestation-token")
                        if not attestation_token:
                            await self.increment_risk(
                                ip, 20,
                                "Missing device attestation token (Root/Jailbreak suspected)"
                            )
                            reason = await self.redis.get(f"shield:block:{ip}")
                            if reason:
                                return True, f"Shield Risk Block: {reason}"

                # 3b. VPN / Proxy blocking — cached to avoid live lookup on every request
                if sec_settings.get("block_vpn_and_proxy") == "true":
                    is_vpn, vpn_reason = await self._check_vpn_cached(ip)
                    if is_vpn:
                        print(f"[SHIELD] VPN/PROXY BLOCKED: {ip} ({vpn_reason})")
                        return True, f"Security Policy: VPN/Proxy/Datacenter traffic blocked"

                # 3c. Biometric IP throttle synchronization
                max_bio = int(sec_settings.get("max_biometric_attempts_per_ip", 10))
                bio_count = await self.redis.zcard(f"rl:biometric:ip:{ip}")
                if bio_count and bio_count >= max_bio:
                    await self.increment_risk(
                        ip,
                        int(bio_count),
                        f"Biometric IP limit exceeded ({bio_count}/{max_bio})"
                    )
                    return True, f"Security Policy: Biometric limit exceeded at edge ({bio_count}/{max_bio})"

        except Exception as e:
            print(f"[SHIELD] Security-policy-sync error: {e}")

        # --- LAYER 4: General Backend Rate Limit Heuristics ---
        auth_keys = [
            f"rl:login:ip:{ip}",
            f"rl:enrollment:ip:{ip}",
        ]
        for key in auth_keys:
            count = await self.redis.zcard(key)
            if count and count >= 50:
                await self.increment_risk(
                    ip, int(count),
                    "Excessive backend rate limit failures detected at Edge"
                )
                return True, "Edge proxy detected heavy backend failure rate"

        return False, ""

    # =========================================================================
    # PRIVATE HELPERS — cached external lookups
    # =========================================================================

    async def _get_country_code(self, ip: str) -> str | None:
        """Returns country code for an IP, using Redis cache (TTL 1h)."""
        cache_key = f"geo:ip:{ip}"
        cached_raw = await self.redis.get(cache_key)
        if cached_raw:
            return json.loads(cached_raw).get("country_code")
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=3.0) as _c:
                r = await _c.get(f"http://ip-api.com/json/{ip}?fields=status,countryCode")
                data = r.json()
                if data.get("status") == "success":
                    country_code = data.get("countryCode")
                    geo_payload = json.dumps({"country_code": country_code, "ip": ip})
                    await self.redis.setex(cache_key, 3600, geo_payload)
                    return country_code
        except Exception as lookup_err:
            print(f"[SHIELD] Geo lookup failed for {ip}: {lookup_err}")
        return None

    async def _check_vpn_cached(self, ip: str) -> tuple[bool, str]:
        """
        Checks if IP is a VPN/proxy/datacenter. Result is cached in Redis
        for 1 hour to avoid a live ip-api.com call on every request.
        Returns (is_vpn, reason_string).
        """
        cache_key = f"shield:vpn:{ip}"
        cached_raw = await self.redis.get(cache_key)
        if cached_raw:
            cached = json.loads(cached_raw)
            return cached.get("is_vpn", False), cached.get("reason", "")

        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=3.0) as _c:
                r = await _c.get(
                    f"http://ip-api.com/json/{ip}?fields=status,proxy,hosting,query"
                )
                data = r.json()
                if data.get("status") == "success":
                    is_vpn = bool(data.get("proxy") or data.get("hosting"))
                    reason = f"proxy={data.get('proxy')}, hosting={data.get('hosting')}"
                    # Cache result for 1 hour — VPN status rarely changes
                    payload = json.dumps({"is_vpn": is_vpn, "reason": reason})
                    await self.redis.setex(cache_key, 3600, payload)
                    return is_vpn, reason
        except Exception as vpn_err:
            print(f"[SHIELD] VPN check failed for {ip}: {vpn_err}")

        return False, ""

    # =========================================================================
    # DASHBOARD HELPERS
    # =========================================================================

    async def get_block_count(self) -> int:
        """O(1) block count using a dedicated counter key (not KEYS scan)."""
        count = await self.redis.get("shield:block_count")
        return int(count) if count else 0

    async def get_all_blocked(self) -> dict:
        """Returns all blocked IPs with reasons and TTLs."""
        keys = await self.redis.keys("shield:block:*")
        blocked = {}
        for key in keys:
            ip = key.split(":")[-1]
            reason = await self.redis.get(key)
            ttl = await self.redis.ttl(key)
            blocked[ip] = {"reason": reason, "expires_in_sec": ttl}
        return blocked
