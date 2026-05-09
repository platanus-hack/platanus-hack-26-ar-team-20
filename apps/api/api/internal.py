from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.indexer import IndexerAgent
from agents.schemas import IndexerInput, IndexerOutput
from core.anthropic_client import get_anthropic
from core.config import settings
from core.github_client import GitHubClient
from core.posthog_client import PostHogClient
from core.supabase_client import get_supabase

router = APIRouter()


class IndexerRunRequest(BaseModel):
    org_id: str
    repo_id: str
    repo_full_name: str
    since_sha: Optional[str] = None


def get_github() -> GitHubClient:
    return GitHubClient(settings)


def get_posthog() -> PostHogClient:
    return PostHogClient(settings)


def get_indexer_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
    github: GitHubClient = Depends(get_github),
    posthog: PostHogClient = Depends(get_posthog),
) -> IndexerAgent:
    return IndexerAgent(anthropic, supabase, github, posthog)


@router.post("/indexer/run", response_model=IndexerOutput)
async def run_indexer(
    body: IndexerRunRequest,
    agent: IndexerAgent = Depends(get_indexer_agent),
) -> IndexerOutput:
    try:
        return await agent.run(
            IndexerInput(
                repo_id=body.repo_id,
                repo_full_name=body.repo_full_name,
                since_sha=body.since_sha,
            ),
            org_id=body.org_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
