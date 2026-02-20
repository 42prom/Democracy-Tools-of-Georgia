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
        """Applies a hard block to an IP."""
        block_key = f"shield:block:{ip}"
        await self.redis.setex(block_key, duration_sec, reason)
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
                            # Try cached geo info first
                            country_code = None
                            geo_info_raw = await self.redis.get(f"geo:ip:{ip}")
                            if geo_info_raw:
                                geo_info = json.loads(geo_info_raw)
                                country_code = geo_info.get("country_code")
                            else:
                                # No cache: do a live lookup directly in the Shield
                                try:
                                    import httpx as _httpx
                                    async with _httpx.AsyncClient(timeout=3.0) as _c:
                                        r = await _c.get(f"http://ip-api.com/json/{ip}?fields=status,countryCode")
                                        data = r.json()
                                        if data.get("status") == "success":
                                            country_code = data.get("countryCode")
                                            # Cache for 1 hour to avoid repeated lookups
                                            geo_payload = json.dumps({"country_code": country_code, "ip": ip})
                                            await self.redis.setex(f"geo:ip:{ip}", 3600, geo_payload)
                                except Exception as lookup_err:
                                    print(f"[SHIELD] Live geo-lookup failed for {ip}: {lookup_err}")

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
                # If attestation is required and the request has no X-Attestation-Token header,
                # we increment risk rather than hard-block (backend validates the token content).
                if sec_settings.get("require_device_attestation") == "true":
                    if request is not None:
                        attestation_token = request.headers.get("x-attestation-token")
                        if not attestation_token:
                            await self.increment_risk(
                                ip, 20,
                                "Missing device attestation token (Root/Jailbreak suspected)"
                            )
                            # Re-check if this increment triggered a block
                            reason = await self.redis.get(f"shield:block:{ip}")
                            if reason:
                                return True, f"Shield Risk Block: {reason}"

                # 3b. Biometric IP throttle synchronization
                # The backend limit is read from the security settings
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
    # DASHBOARD HELPERS
    # =========================================================================

    async def get_block_count(self) -> int:
        keys = await self.redis.keys("shield:block:*")
        return len(keys)

    async def get_all_blocked(self) -> dict:
        keys = await self.redis.keys("shield:block:*")
        blocked = {}
        for key in keys:
            ip = key.split(":")[-1]
            reason = await self.redis.get(key)
            ttl = await self.redis.ttl(key)
            blocked[ip] = {"reason": reason, "expires_in_sec": ttl}
        return blocked
