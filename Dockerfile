FROM python:3.12-slim

# uv is the package manager declared by pyproject.toml — install it first
# and reuse its venv-less workflow so the Docker layer stays small.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (cached layer) — copy lockfile and pyproject only.
COPY apps/api/pyproject.toml apps/api/uv.lock /app/
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the API source and the prompts package it loads at runtime.
COPY apps/api /app
COPY packages/prompts /packages/prompts

# Re-sync to install the project itself.
RUN uv sync --frozen --no-dev

# Railway provides $PORT; default to 8000 for local docker run.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
