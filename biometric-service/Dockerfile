FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required for OpenCV, InsightFace, and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Download basic models (buffalo_l) during build to cache them if possible, 
# strictly speaking insightface downloads on first run, so we might handle this in code startup.

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
