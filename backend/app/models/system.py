from typing import Literal

from pydantic import BaseModel


class StorageCfgIn(BaseModel):
    backend: Literal["local", "s3"] = "local"
    local_dir: str = "uploads"
    local_public_url: str = ""
    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str | None = None  # None = keep existing, "" = clear
    s3_bucket: str = "lms-media"
    s3_region: str = "auto"
    s3_public_url: str = ""


class ZoomCfgIn(BaseModel):
    account_id: str = ""
    client_id: str = ""
    client_secret: str | None = None
    host_email: str = ""


class GoogleCfgIn(BaseModel):
    enabled: bool = False
    client_id: str = ""
    client_secret: str | None = None


class MailCfgIn(BaseModel):
    enabled: bool = False
    host: str = ""
    port: int = 587
    username: str = ""
    password: str | None = None
    from_email: str = ""
    tls: bool = True
    otp_ttl_seconds: int = 600
    otp_length: int = 6


class SystemConfigIn(BaseModel):
    storage: StorageCfgIn | None = None
    zoom: ZoomCfgIn | None = None
    google: GoogleCfgIn | None = None
    mail: MailCfgIn | None = None


class TestMailIn(BaseModel):
    to: str
