from functools import lru_cache

from anthropic import Anthropic

from core.config import settings


@lru_cache(maxsize=1)
def get_anthropic() -> Anthropic:
    return Anthropic(api_key=settings.anthropic_api_key)
