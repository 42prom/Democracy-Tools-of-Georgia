import redis.asyncio as redis
from datetime import datetime, timedelta
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

    async def increment_risk(self, ip: str, amount: int, reason: str):
        """Increments risk score for an IP based on heuristic triggers."""
        key = f"shield:risk:{ip}"
        
        # Increment risk
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
        await self.redis.ltrim(log_key, 0, 49) # Keep last 50 events
        
        # Check if block threshold reached
        if current >= self.block_threshold:
            await self.block_ip(ip, f"Risk score exceeded: {current}")

    async def block_ip(self, ip: str, reason: str, duration_sec: int = 3600):
        """Applies a hard block to an IP."""
        block_key = f"shield:block:{ip}"
        await self.redis.setex(block_key, duration_sec, reason)
        print(f"[SHIELD] BLOCKED IP {ip}: {reason}")

    async def is_ip_blocked(self, ip: str) -> tuple[bool, str]:
        """Checks if an IP is blocked either by Shield or Backend rate limits."""
        # 1. Check Shield direct block
        block_key = f"shield:block:{ip}"
        reason = await self.redis.get(block_key)
        if reason:
            return True, f"Shield Risk Block: {reason}"
            
        # 2. Check traditional Auth/Biometric Backend limits
        # We read the backend's Redis keys to enforce blocks at the edge via Proxy
        auth_keys = [
            f"rl:login:ip:{ip}", 
            f"rl:enrollment:ip:{ip}",
            f"rl:biometric:ip:{ip}"
        ]
        
        for key in auth_keys:
            # Check length of the sorted set storing failed attempts
            count = await self.redis.zcard(key)
            if count and count >= 50: # Default backend upper limit heuristic
                # Penalize and block at gateway edge
                await self.increment_risk(ip, int(count), "Excessive backend rate limit failures detected at Edge")
                return True, "Edge proxy detected heavy backend failure rate"
                
        return False, ""

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
