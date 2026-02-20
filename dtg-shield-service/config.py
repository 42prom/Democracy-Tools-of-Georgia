import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Gateway Settings
    PORT: int = 8080
    HOST: str = "0.0.0.0"
    
    # Target Backend
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:3000")
    
    # Redis Integration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # AI/Heuristic Settings
    BASE_LATENCY_THRESHOLD_MS: int = 500
    BIOMETRIC_FAIL_WEIGHT: int = 50
    AUTH_FAIL_WEIGHT: int = 10
    BLOCK_THRESHOLD: int = 100
    
    class Config:
        env_file = ".env"

config = Settings()
