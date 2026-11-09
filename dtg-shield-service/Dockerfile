FROM python:3.11-slim@sha256:07d4824036af339fa1b6ef769cc99d9c10a141769538b52b3b597c84f7a7b535

RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir --upgrade setuptools==84.2.1 wheel==0.48.0 \
    && pip install --no-cache-dir -r requirements.lock

RUN groupadd --system --gid 10001 dtg \
    && useradd --system --uid 10001 --gid dtg --no-create-home dtg

COPY --chown=dtg:dtg . /app

USER 10001:10001

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
