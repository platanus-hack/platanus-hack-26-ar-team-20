import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import demo, experiments, internal, webhooks


# CORS: in dev we serve everything off localhost; in prod the frontend
# (Vercel) and backend (Railway) live on different origins. Server actions
# go server→server so they don't need CORS, but realtime debugging from
# the browser does. Set HELIX_CORS_ORIGINS to a comma-separated allowlist;
# falls back to "*" so dev / preview deploys keep working.
def _allowed_origins() -> list[str]:
    raw = os.getenv("HELIX_CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Helix API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(experiments.router, prefix="/experiments", tags=["experiments"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(internal.router, prefix="/internal", tags=["internal"])
app.include_router(demo.router, prefix="/demo", tags=["demo"])


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
