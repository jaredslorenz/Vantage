from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Public backend URL (used for OAuth redirect URIs)
    backend_url: str = "http://localhost:8000"

    # Vercel
    vercel_client_id: str = ""
    vercel_client_secret: str = ""

    # Encryption
    token_encryption_key: str

    # Anthropic
    anthropic_api_key: str = ""

    # OpenAI
    openai_api_key: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
