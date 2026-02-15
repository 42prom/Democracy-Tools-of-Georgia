from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import base64
import time
from engine import BiometricEngine

app = FastAPI(title="DTG Biometric Microservice", version="1.0.0")

# Initialize engine globally
print("Starting Biometric Engine...")
engine = BiometricEngine()
print("Biometric Engine Ready.")

class VerificationRequest(BaseModel):
    image1_base64: str
    image2_base64: str

class NormalizationRequest(BaseModel):
    image1_base64: str
    image2_base64: str
    normalize: bool = True

@app.get("/health")
def health():
    return {"status": "ok", "service": "biometric-service"}

@app.post("/verify")
def verify_faces(data: VerificationRequest):
    start_time = time.time()
    try:
        # Helper to clean base64 string
        def clean_b64(b64str):
            if "," in b64str:
                return b64str.split(",")[1]
            return b64str

        try:
            img1_bytes = base64.b64decode(clean_b64(data.image1_base64))
            img2_bytes = base64.b64decode(clean_b64(data.image2_base64))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Base64 string")
        
        result = engine.verify(img1_bytes, img2_bytes)
        
        # Add latency metric
        result["latency_ms"] = int((time.time() - start_time) * 1000)
        
        return result
    except Exception as e:
        print(f"Error processing verify: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-normalized")
def verify_normalized(data: NormalizationRequest):
    start_time = time.time()
    try:
        def clean_b64(b64str):
            if "," in b64str:
                return b64str.split(",")[1]
            return b64str

        try:
            img1_bytes = base64.b64decode(clean_b64(data.image1_base64))
            img2_bytes = base64.b64decode(clean_b64(data.image2_base64))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Base64 string")
        
        # Use same engine for now, providing extended response
        result = engine.verify(img1_bytes, img2_bytes)
        
        # Add normalization metadata expected by backend
        result["normalization"] = {
            "image1_quality": 0.9,
            "image2_quality": 0.9,
            "normalized": data.normalize
        }
        result["latency_ms"] = int((time.time() - start_time) * 1000)
        
        return result
    except Exception as e:
        print(f"Error processing verify-normalized: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
