import secrets

from fastapi import Header, HTTPException, status

from core.config import settings


def require_internal_token(authorization: str | None = Header(default=None)) -> None:
    expected = settings.helix_api_internal_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HELIX_API_INTERNAL_TOKEN is not configured",
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing internal token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
            headers={"WWW-Authenticate": "Bearer"},
        )
