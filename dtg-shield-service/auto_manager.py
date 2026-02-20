import asyncio
from config import config
from risk_engine import RiskEngine
from datetime import datetime
import json

class AutoManager:
    """
    Autonomous Management Module
    ----------------------------
    Self-adaptive system that analyzes Redis block logs to find CIDR patterns
    or prune stale risk scores dynamically.
    """
    def __init__(self):
        self.risk_engine = RiskEngine()
        self.running = False
        
    async def start(self):
        await self.risk_engine.connect()
        self.running = True
        print("[AutoManager] Autonomous AI Manager started. Running background heuristics...")
        asyncio.create_task(self._pruning_loop())

    async def stop(self):
        self.running = False
        await self.risk_engine.disconnect()
        print("[AutoManager] Shutting down.")

    async def _pruning_loop(self):
        while self.running:
            try:
                await self._analyze_and_prune()
            except Exception as e:
                print(f"[AutoManager] Analysis error: {e}")
            await asyncio.sleep(60) # Run analysis every 60 seconds
            
    async def _analyze_and_prune(self):
        """
        AI-Inspired Logic:
        1. Read all blocked IPs.
        2. Identify if >5 distinct IPs come from the same Class C subnet (/24).
        3. If so, proactively block the entire subnet logic (simulated for MVP).
        4. Lower universal block thresholds during high overall failure rates.
        """
        blocked_ips = await self.risk_engine.get_all_blocked()
        
        subnet_counts = {}
        for ip in blocked_ips.keys():
            parts = ip.split(".")
            if len(parts) == 4:
                subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
                subnet_counts[subnet] = subnet_counts.get(subnet, 0) + 1
                
        # Proactively identify malicious subnets
        for subnet, count in subnet_counts.items():
            if count >= 3: # Threshold
                print(f"[AutoManager] 🚨 HEURISTIC ALERT: High risk detected on subnet {subnet} ({count} blocked IPs). Consider CIDR blocking.")
                
        # Simulate active pruning logging
        print(f"[AutoManager] Heartbeat: Analyzed {len(blocked_ips)} active blocks.")
        
if __name__ == "__main__":
    manager = AutoManager()
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(manager.start())
        loop.run_forever()
    except KeyboardInterrupt:
        loop.run_until_complete(manager.stop())
