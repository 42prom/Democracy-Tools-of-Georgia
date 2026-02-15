# DTG Biometric Microservice

This service provides high-performance face verification using **InsightFace** and **ONNX Runtime**. It runs as a local Python microservice.

## Prerequisites

- Python 3.10 or higher
- (Optional) Docker

## Setup (Method 1: Direct Python - Recommended for Development)

1.  **Install Python 3.10**:
    - Download from [python.org](https://www.python.org/downloads/)
    - **IMPORTANT**: Check "Add Python to PATH" during installation.

2.  **Install Dependencies**:
    Open a terminal in this directory (`biometric-service/`) and run:

    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the Service**:
    ```bash
    python main.py
    ```
    The service will start on `http://0.0.0.0:8000`.

## Setup (Method 2: Docker - Recommended for Production)

1.  **Build the Image**:

    ```bash
    docker build -t dtg-biometric-service .
    ```

2.  **Run the Container**:
    ```bash
    docker run -p 8000:8000 dtg-biometric-service
    ```

## API Usage

**Endpoint**: `POST /verify`

**Body**:

```json
{
  "image1_base64": "...",
  "image2_base64": "..."
}
```

**Response**:

```json
{
  "match": true,
  "score": 0.85,
  "threshold": 0.4
}
```
