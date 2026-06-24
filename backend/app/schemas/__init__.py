"""Pydantic schemas — request/response DTOs for the API layer."""

from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ─── Auth ──────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=4)


# ─── User ──────────────────────────────────────────────────────────────


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_emoji: Optional[str] = None
    avatar_color: Optional[str] = None
    accent_color: Optional[str] = None
    wallpaper: Optional[str] = None


# ─── Chat ──────────────────────────────────────────────────────────────


class ChatCreate(BaseModel):
    type: str = "direct"
    title: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[str]] = None
    avatar_emoji: Optional[str] = None
    avatar_color: Optional[str] = None


class ChatSettingsUpdate(BaseModel):
    action: str  # pin | mute | pinMessage
    value: Optional[Any] = None
    message_id: Optional[str] = None


# ─── Message ───────────────────────────────────────────────────────────


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    type: str = "text"
    reply_to_id: Optional[str] = None
    duration: Optional[int] = None


class MessageEdit(BaseModel):
    content: Optional[str] = None
    action: Optional[str] = None  # "star" for star toggle


class ReactionToggle(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=10)


class ForwardRequest(BaseModel):
    message_id: str
    target_chat_ids: List[str] = Field(..., min_length=1)
