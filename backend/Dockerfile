FROM python:3.12-slim

# Create a non-privileged user to run the app
RUN useradd --create-home appuser
WORKDIR /home/appuser

# Copy and install dependencies as root (cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app files and change ownership to appuser
COPY --chown=appuser:appuser app/ ./app/

# Switch to the non-root user
USER appuser

EXPOSE 8001

# Shell form lets uvicorn read the $PORT environment variable set by Render
CMD uvicorn app.main:asgi_app --host 0.0.0.0 --port ${PORT:-8001}
