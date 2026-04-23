FROM python:3.10-slim

WORKDIR /app

# System deps for crypto/C extensions (scalecodec, cryptography, substrate libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libssl-dev \
    libffi-dev \
    libgmp-dev \
    pkg-config \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer cache — only rebuilds when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create startup script with diagnostics
RUN printf '#!/bin/sh\necho "=== Railway startup ==="\necho "PORT=${PORT:-NOT_SET}"\necho "DATABASE_URL=${DATABASE_URL:-not_set}"\necho "Python: $(python3 --version)"\necho "Working dir: $(pwd)"\nls -la main.py\nexec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1\n' > /app/start.sh && chmod +x /app/start.sh

# Expose Railway's dynamic port
EXPOSE 8080

# Start via script so we see env info in Deploy Logs
CMD ["/app/start.sh"]