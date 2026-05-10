from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        extra="ignore",
    )

    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-6"

    supabase_url: str
    supabase_service_role_key: str

    posthog_project_api_key: str
    posthog_personal_api_key: str
    posthog_host: str = "https://app.posthog.com"
    posthog_project_id: str

    github_app_id: str = ""
    github_app_private_key: str = ""
    github_app_installation_id: str = ""
    github_pat: str = ""
    github_demo_repo: str

    helix_api_internal_token: str = ""
    helix_demo_mode: bool = True
    helix_fast_forward_enabled: bool = True


settings = Settings()
