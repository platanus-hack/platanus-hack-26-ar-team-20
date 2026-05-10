import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import demo, experiments, internal, webhooks
from core.internal_auth import require_internal_token


# CORS: in dev we serve everything off localhost; in prod the frontend
# (Vercel) and backend (Railway) live on different origins. Server actions
# go server-to-server so they don't need CORS, but realtime debugging from
# the browser does. Set HELIX_CORS_ORIGINS to a comma-separated allowlist.
DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def _allowed_origins() -> list[str]:
    raw = os.getenv("HELIX_CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_DEV_ORIGINS
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Helix API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

internal_dependencies = [Depends(require_internal_token)]

app.include_router(
    experiments.router,
    prefix="/experiments",
    tags=["experiments"],
    dependencies=internal_dependencies,
)
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(
    internal.router,
    prefix="/internal",
    tags=["internal"],
    dependencies=internal_dependencies,
)
app.include_router(
    demo.router,
    prefix="/demo",
    tags=["demo"],
    dependencies=internal_dependencies,
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
