from fastapi import APIRouter

router = APIRouter()


@router.post("/{experiment_id}/run")
async def run_experiment(experiment_id: str) -> dict[str, str]:
    return {"experiment_id": experiment_id, "status": "queued"}
