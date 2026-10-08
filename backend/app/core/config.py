from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LMS"
    debug: bool = False
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:8080"

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "lms"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    google_client_id: str = ""
    google_client_secret: str = ""

    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = "sandbox"  # sandbox | live
    paypal_webhook_id: str = ""

    # Zoom Server-to-Server OAuth (Marketplace → Build App → Server-to-Server)
    zoom_account_id: str = ""
    zoom_client_id: str = ""
    zoom_client_secret: str = ""
    zoom_host_email: str = ""  # host user email for created meetings

    # Email OTP (student registration verification)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True
    otp_ttl_seconds: int = 600
    otp_length: int = 6

    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "lms-media"
    s3_region: str = "auto"
    s3_public_url: str = ""

    # Local file storage (when storage backend = "local")
    upload_dir: str = "uploads"
    public_api_url: str = ""  # optional absolute base for local media URLs

    default_currency: str = "USD"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def paypal_api_base(self) -> str:
        return (
            "https://api-m.paypal.com"
            if self.paypal_mode == "live"
            else "https://api-m.sandbox.paypal.com"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
