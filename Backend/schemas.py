from pydantic import BaseModel, EmailStr, ConfigDict, Field
from datetime import datetime
from typing import Optional, Literal


class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=72)


class UserResponse(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPublic(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    bio: Optional[str] = ""
    location: Optional[str] = ""
    avatar_url: Optional[str] = ""


class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    email: EmailStr
    bio: str
    location: str
    avatar_url: str
    posts_count: int
    followers_count: int
    following_count: int


class UserSettingUpdate(BaseModel):
    email_alerts: bool
    weekly_digest: bool
    compact_mode: bool


class UserSettingResponse(BaseModel):
    email_alerts: bool
    weekly_digest: bool
    compact_mode: bool


class PostBase(BaseModel):
    title: str
    content: str


class PostCreate(PostBase):
    pass


class PostResponse(PostBase):
    id: int
    author_id: int
    created_at: datetime
    author: UserPublic

    model_config = ConfigDict(from_attributes=True)


class FeedPostResponse(PostResponse):
    like_count: int = 0
    comment_count: int = 0
    is_liked: bool = False
    is_bookmarked: bool = False
    is_following_author: bool = False


class CommentBase(BaseModel):
    content: str


class CommentCreate(CommentBase):
    pass


class CommentResponse(CommentBase):
    id: int
    post_id: int
    author_id: int
    created_at: datetime
    author: UserPublic
    like_count: int = 0
    is_liked: bool = False

    model_config = ConfigDict(from_attributes=True)


class ReactionCreate(BaseModel):
    reaction_type: Literal["like", "love", "insightful", "celebrate"] = "like"


class MessageCreate(BaseModel):
    receiver_id: int
    content: str


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: str
    created_at: datetime
    is_read: bool = False
    type: str = "message"

    model_config = ConfigDict(from_attributes=True)


class TypingEvent(BaseModel):
    type: Literal["typing"] = "typing"
    receiver_id: int
    is_typing: bool


class NotificationResponse(BaseModel):
    id: int
    recipient_id: int
    actor_id: Optional[int] = None
    type: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    message: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportCreate(BaseModel):
    target_type: Literal["post", "comment", "user"]
    target_id: int
    reason: str = Field(min_length=5, max_length=1000)


class ReportUpdate(BaseModel):
    status: Literal["open", "in_review", "resolved", "dismissed"]
    admin_note: Optional[str] = ""


class ReportResponse(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    reason: str
    status: str
    admin_note: Optional[str]
    reviewed_by: Optional[int]
    created_at: datetime
    reviewed_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class FollowStatusResponse(BaseModel):
    is_following: bool


class BookmarkStatusResponse(BaseModel):
    is_bookmarked: bool


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    username: str
    user_id: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class MessageReadResponse(BaseModel):
    marked_count: int


class OnlineUsersResponse(BaseModel):
    online_user_ids: list[int]


class ModerationSummary(BaseModel):
    open_reports: int
    in_review_reports: int
    resolved_reports: int
