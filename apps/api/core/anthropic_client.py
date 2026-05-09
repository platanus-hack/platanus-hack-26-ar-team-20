from functools import lru_cache

from anthropic import AsyncAnthropic

from core.config import settings


@lru_cache(maxsize=1)
def get_anthropic() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.anthropic_api_key)
