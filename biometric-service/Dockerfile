FROM python:3.11-slim@sha256:07d4824036af339fa1b6ef769cc99d9c10a141769538b52b3b597c84f7a7b535 AS wheels

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.lock

FROM python:3.11-slim@sha256:07d4824036af339fa1b6ef769cc99d9c10a141769538b52b3b597c84f7a7b535 AS runtime

ENV HOME=/home/dtg \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    && groupadd --system --gid 10001 dtg \
    && useradd --system --uid 10001 --gid dtg --create-home dtg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=wheels /wheels /wheels
RUN pip install --no-cache-dir --upgrade setuptools==84.2.1 wheel==0.48.0 \
    && pip install --no-cache-dir /wheels/* && rm -rf /wheels

WORKDIR /app

COPY --chown=dtg:dtg . .

USER 10001:10001

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
