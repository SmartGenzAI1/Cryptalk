FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

EXPOSE 8001

CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "8001"]
