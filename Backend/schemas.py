from pydantic import BaseModel, EmailStr, ConfigDict,Field
from datetime import datetime
from typing import List, Optional

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
   password: str = Field(min_length=6, max_length=72)

class UserResponse(UserBase):
    id: int
    created_at: datetime
    
    # This tells Pydantic to read data even if it's not a standard dictionary (like an SQLAlchemy model)
    model_config = ConfigDict(from_attributes=True)

# --- POST SCHEMAS ---
class PostBase(BaseModel):
    title: str
    content: str

class PostCreate(PostBase):
    pass

class PostResponse(PostBase):
    id: int
    author_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)