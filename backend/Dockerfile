# syntax=docker/dockerfile:1

# Patchlane API: the FastAPI orchestrator plus the Factory droid CLI it drives.
# Build from the repo root, because the image needs both backend/ and demo/:
#   docker build -f backend/Dockerfile -t patchlane-api .
# No secrets are baked in. They come from backend/.env at run time (see docker-compose.yml).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

# Fail a piped RUN (curl | sh) when any part of the pipe fails.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# git: the Droid runner runs `git init` in its temp workspace.
# curl: the droid installer and the HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 --shell /usr/sbin/nologin patchlane

# The droid CLI installs to ~/.local/bin of the runtime user. On x86-64 the installer picks
# the AVX2 or "baseline" build from the CPU of the machine that builds the image.
# Pinned to the version the tool lockdown was verified against (MCP tools via ToolSearch + Script);
# the installer still checks the download's sha256. Auto-update is off for the same reason.
ARG DROID_VERSION=0.244.0
USER patchlane
ENV PATH="/home/patchlane/.local/bin:${PATH}" \
    FACTORY_DROID_AUTO_UPDATE_ENABLED=false
RUN curl -fsSL https://app.factory.ai/cli | sed "s/^VER=\".*\"/VER=\"${DROID_VERSION}\"/" | sh \
    && droid --version | grep -q "${DROID_VERSION}"

# Dependencies before code, so code changes reuse this layer.
USER root
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Code stays root-owned (read-only to the app user). Only runs/ is writable; a named volume
# mounted there inherits this ownership. The Droid workspace is a temp dir under /tmp.
COPY demo/ demo/
COPY backend/ backend/
RUN mkdir runs && chown patchlane:patchlane runs

# pytest's cache is off because the code tree is read-only.
ENV PATCHLANE_RUNS_DIR=/app/runs \
    PYTEST_ADDOPTS="-p no:cacheprovider"

USER patchlane
WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# Exactly one worker: incident state lives in memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-graceful-shutdown", "5"]
