from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/github")
async def github_webhook(request: Request) -> dict:
    payload = await request.json()
    return {"received": True, "event": payload.get("action")}
