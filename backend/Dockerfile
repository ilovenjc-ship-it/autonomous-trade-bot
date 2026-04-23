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

# Create startup script with full diagnostics — output appears in Railway Deploy Logs
RUN printf '#!/bin/sh\n\
echo "=== RAILWAY STARTUP ==="\n\
echo "PORT=${PORT:-NOT_SET}"\n\
echo "DATABASE_URL=${DATABASE_URL:-NOT_SET}"\n\
echo "RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-NOT_SET}"\n\
echo "Python: $(python3 --version 2>&1)"\n\
echo "Working dir: $(pwd)"\n\
echo "Files:"\n\
ls -la\n\
echo "=== Testing import ==="\n\
python3 -c "from main import app; print(\"IMPORT OK\")" 2>&1\n\
echo "=== Starting uvicorn ==="\n\
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1 --log-level debug\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose Railway's dynamic port
EXPOSE 8080

# Use startup script — Railway reads startCommand from railway.toml if set,
# but since we removed startCommand from railway.toml, this CMD is used directly.
CMD ["/app/start.sh"]