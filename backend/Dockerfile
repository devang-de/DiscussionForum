# ── Build stage ────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .

# ── Runtime stage ──────────────────────────
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY backend/ .

# Railway provides $PORT; default to 8000 for local
ENV PORT=8000

EXPOSE 8000

# Ensure data directory exists for SQLite volume mount
RUN mkdir -p /app/data

CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
