import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import catalog, demo, incidents
from .config import RUNS_DIR, Settings, settings as default_settings
from .orchestration import incident_runner
from .services.demo_state import DemoState

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, runs_dir: Path | None = RUNS_DIR) -> FastAPI:
    settings = settings or default_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await incident_runner.reset(app.state.demo)  # never leave sandboxes running

    app = FastAPI(title="Patchlane", lifespan=lifespan)
    app.state.settings = settings
    app.state.demo = DemoState(runs_dir)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(demo.router)
    app.include_router(incidents.router)
    app.include_router(catalog.router)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
