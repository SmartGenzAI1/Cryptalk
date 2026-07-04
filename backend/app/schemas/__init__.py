# pydantic schemas — request/response DTOs for the API layer.
# accept BOTH camelCase (JS/Flutter clients) and snake_case (python)

from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class UserUpdate(CamelModel):
    name: Optional[str] = None
    bio: Optional[str] = None


class ChatCreate(CamelModel):
    type: str = "direct"
    title: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[str]] = None
    expires_in_days: Optional[int] = None
    member_keys: Optional[dict] = None


class ChatSettingsUpdate(CamelModel):
    action: str  # pin | mute
    value: Optional[Any] = None


class PushTokenUpdate(CamelModel):
    token: str = Field(..., min_length=1)
    platform: str = Field(..., pattern="^(fcm|apns|web)$")
