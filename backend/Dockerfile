FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE $PORT

CMD uvicorn app.main:asgi_app --host 0.0.0.0 --port ${PORT:-8001}
