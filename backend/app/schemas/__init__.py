# pydantic schemas — request/response DTOs for the API layer.
# accept BOTH camelCase (JS/Flutter clients) and snake_case (python)

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class UserUpdate(CamelModel):
    name: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)


class ChatCreate(CamelModel):
    type: Literal["direct", "group", "channel"] = "direct"
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    member_ids: Optional[List[str]] = None
    expires_in_days: Optional[int] = None
    member_keys: Optional[dict] = None


class ChatSettingsUpdate(CamelModel):
    action: Literal["pin", "mute"]
    value: Optional[Any] = None


class PushTokenUpdate(CamelModel):
    token: str = Field(..., min_length=1, max_length=500)
    platform: str = Field(..., pattern="^(fcm|apns|web)$")
