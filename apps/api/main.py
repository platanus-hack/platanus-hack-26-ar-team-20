from fastapi import FastAPI

app = FastAPI(title="Helix API", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
