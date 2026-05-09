import re
from functools import lru_cache

from supabase import Client, create_client

from core.config import settings


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def looks_like_uuid(value: str) -> bool:
    return bool(_UUID_RE.match(value))


def filter_experiment(query, value: str):
    """Filter an experiments query by id (if `value` is a UUID) or by
    experiment_id (slug). The OR-with-uuid trick fails inside Postgres
    because every branch is type-checked against the column, so we
    pre-route the query to avoid casting a slug to uuid.
    """
    if looks_like_uuid(value):
        return query.eq("id", value)
    return query.eq("experiment_id", value)
