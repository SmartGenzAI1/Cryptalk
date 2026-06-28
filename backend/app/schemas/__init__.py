# pydantic schemas — request/response DTOs for the API layer.
# accept BOTH camelCase (JS/Flutter clients) and snake_case (python) via
# populate_by_name=True + to_camel alias generator.

from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    # accepts camelCase JSON keys for snake_case fields
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


# auth

class UserUpdate(CamelModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_emoji: Optional[str] = None
    avatar_color: Optional[str] = None
    accent_color: Optional[str] = None
    wallpaper: Optional[str] = None


# chat

class ChatCreate(CamelModel):
    type: str = "direct"
    title: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[str]] = None
    avatar_emoji: Optional[str] = None
    avatar_color: Optional[str] = None
    expires_in_days: Optional[int] = None  # 1-7 days for temp groups
    member_keys: Optional[dict] = None

class ChatSettingsUpdate(CamelModel):
    action: str  # pin | mute | pinMessage
    value: Optional[Any] = None
    message_id: Optional[str] = None

# message

class MessageCreate(CamelModel):
    content: str = Field(..., min_length=1)
    type: str = "text"
    reply_to_id: Optional[str] = None
    duration: Optional[int] = None
    expires_in: Optional[int] = None  # seconds until self-destruct (null = none)
    # supabase storage path returned by POST /api/uploads. lets the server
    # delete the ciphertext blob when the message is delivered/deleted.
    attachment_path: Optional[str] = None


class MessageEdit(CamelModel):
    content: Optional[str] = None
    action: Optional[str] = None  # "star" for star toggle

class ReactionToggle(CamelModel):
    emoji: str = Field(..., min_length=1, max_length=10)


class ForwardRequest(CamelModel):
    message_id: str
    target_chat_ids: List[str] = Field(..., min_length=1)
