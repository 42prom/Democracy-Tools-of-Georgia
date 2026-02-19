import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis

class BiometricEngine:
    def __init__(self):
        print("[BiometricEngine] Initializing InsightFace (buffalo_l)...")
        # Initialize FaceAnalysis with default models
        # This will download models to ~/.insightface/models/ on first run if not present
        # 'buffalo_l' is accurate but lightweight enough for CPU usage
        self.app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        
        # Prepare the model with strict detection size (640x640 is standard)
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        print("[BiometricEngine] Model loaded successfully.")

    def _decode_image(self, image_bytes: bytes):
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            print(f"[BiometricEngine] Decode error: {e}")
            return None

    def verify(self, img1_bytes: bytes, img2_bytes: bytes) -> dict:
        img1 = self._decode_image(img1_bytes)
        img2 = self._decode_image(img2_bytes)

        if img1 is None or img2 is None:
            return {"error": "Invalid image data - could not decode", "match": False, "score": 0.0}

        # Detect faces
        faces1 = self.app.get(img1)
        faces2 = self.app.get(img2)

        if not faces1 or not faces2:
            return {
                "error": "Face not detected in one or both images", 
                "match": False, 
                "score": 0.0,
                "faces_detected": [len(faces1), len(faces2)]
            }

        # Take largest face if multiple are found (prevent background face mismatch)
        face1 = sorted(faces1, key=lambda x: x.bbox[2]*x.bbox[3], reverse=True)[0]
        face2 = sorted(faces2, key=lambda x: x.bbox[2]*x.bbox[3], reverse=True)[0]

        # Calculate Cosine Similarity
        # InsightFace embeddings are normalized, so simple dot product is sufficient
        # but we do full normalization formula to be safe.
        embedding1 = face1.embedding
        embedding2 = face2.embedding
        
        similarity = np.dot(embedding1, embedding2) / (np.linalg.norm(embedding1) * np.linalg.norm(embedding2))
        score = float(max(0, similarity)) # Clamp negative values (unlikely but possible)
        
        # Threshold: 0.4 is typical for arcface verification in wild
        # 0.5 is very strict. 0.3 is loose.
        # We start with 0.4
        threshold = 0.4
        
        return {
            "match": score > threshold,
            "score": score,
            "threshold": threshold,
            "faces_detected": [len(faces1), len(faces2)]
        }
