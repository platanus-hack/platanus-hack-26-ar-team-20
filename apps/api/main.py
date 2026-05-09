from fastapi import FastAPI

from api import experiments, webhooks

app = FastAPI(title="Helix API", version="0.1.0")
app.include_router(experiments.router, prefix="/experiments", tags=["experiments"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
