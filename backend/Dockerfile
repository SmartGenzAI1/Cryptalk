FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim

RUN useradd --create-home appuser && \
    apt-get update && \
    apt-get install -y --no-install-recommends libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

WORKDIR /home/appuser
COPY --chown=appuser:appuser app/ ./app/

USER appuser

EXPOSE 8001

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

CMD ["sh", "-c", "uvicorn app.main:asgi_app --host 0.0.0.0 --port ${PORT:-8001} --workers 1 --log-level warning --no-access-log"]
