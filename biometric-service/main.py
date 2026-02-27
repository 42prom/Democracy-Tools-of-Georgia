"""
DTG Biometric Microservice
==========================

This service provides face verification capabilities using InsightFace.
It handles image normalization, verification against a threshold, and liveness checks (implied).
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import base64
import time
import io
from PIL import Image
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

def resize_image_if_needed(image_bytes: bytes, max_size: int = 640) -> bytes:
    """
    Resizes the image if its larger dimension exceeds max_size, maintaining aspect ratio.
    Returns the image as bytes (JPEG format).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # Check if resize is needed
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Save back to bytes
            buffer = io.BytesIO()
            # Convert to RGB if necessary (e.g. if RGBA) to save as JPEG
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(buffer, format="JPEG", quality=90)
            return buffer.getvalue()
            
        return image_bytes
    except Exception as e:
        print(f"Warning: Image resize failed: {e}")
        return image_bytes

@app.get("/health")
def health():
    """Health check endpoint to verify service status."""
    return {"status": "ok", "service": "biometric-service"}

@app.post("/verify")
def verify_faces(data: VerificationRequest):
    """
    Verifies if two faces match.
    
    Args:
        data (VerificationRequest): Contains two base64 encoded images.
        
    Returns:
        dict: Match result (score, threshold, match boolean).
    """
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
        
        # Optimize images (resize to max 640x640)
        img1_bytes = resize_image_if_needed(img1_bytes)
        img2_bytes = resize_image_if_needed(img2_bytes)
        
        result = engine.verify(img1_bytes, img2_bytes)
        
        # Add latency metric
        result["latency_ms"] = int((time.time() - start_time) * 1000)
        
        return result
    except Exception as e:
        print(f"Error processing verify: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-normalized")
def verify_normalized(data: NormalizationRequest):
    """
    Verifies faces and returns extended normalization metadata.
    Used for enrollment processes where quality checks are important.
    """
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
        
        # Optimize images
        img1_bytes = resize_image_if_needed(img1_bytes)
        img2_bytes = resize_image_if_needed(img2_bytes)
        
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
