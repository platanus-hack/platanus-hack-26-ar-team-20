from fastapi import FastAPI

from api import demo, experiments, internal, webhooks

app = FastAPI(title="Helix API", version="0.1.0")
app.include_router(experiments.router, prefix="/experiments", tags=["experiments"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(internal.router, prefix="/internal", tags=["internal"])
app.include_router(demo.router, prefix="/demo", tags=["demo"])


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
