from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional
import hashlib
import hmac
import json
import os
import random
import urllib.error
import urllib.request

from fastapi import FastAPI, Depends, HTTPException, status, Response, WebSocket, WebSocketDisconnect, Request, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func, inspect, text

from Backend import models, schemas, database, utils, oauth2
from .manager import manager

import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

app = FastAPI(title='Community Blog API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.mount("/static", StaticFiles(directory="Backend/static"), name="static")

LOGIN_WINDOW_SECONDS = 60
MAX_LOGIN_ATTEMPTS = 12
PASSWORD_RESET_OTP_TTL_MINUTES = 10
PASSWORD_RESET_MAX_ATTEMPTS = 5
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _ensure_post_image_url_column() -> None:
    """Backfill legacy databases that predate the image_url column."""
    inspector = inspect(database.engine)
    if 'posts' not in inspector.get_table_names():
        return

    columns = {column['name'] for column in inspector.get_columns('posts')}
    if 'image_url' in columns:
        return

    with database.engine.begin() as conn:
        conn.execute(text("ALTER TABLE posts ADD COLUMN image_url VARCHAR DEFAULT ''"))
        conn.execute(text("UPDATE posts SET image_url = '' WHERE image_url IS NULL"))


@app.on_event('startup')
def startup() -> None:
    database.Base.metadata.create_all(bind=database.engine)
    _ensure_post_image_url_column()


@app.post("/upload-image/")
async def upload_image(file: UploadFile = File(...)):
    result = cloudinary.uploader.upload(file.file)
    return {"image_url": result['secure_url']}


@app.get('/')
def read_root():
    return {'message': 'Welcome to the Community Blog API!'}


def _is_admin(user: models.User) -> bool:
    return user.id == 1 or user.username.lower() == 'admin'


def _require_admin(user: models.User):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail='Admin access required')


def _pair_ids(user_a_id: int, user_b_id: int) -> tuple[int, int]:
    return (user_a_id, user_b_id) if user_a_id < user_b_id else (user_b_id, user_a_id)


def _chat_request_between(db: Session, user_a_id: int, user_b_id: int) -> Optional[models.ChatRequest]:
    low, high = _pair_ids(user_a_id, user_b_id)
    return db.query(models.ChatRequest).filter(
        models.ChatRequest.pair_low_id == low,
        models.ChatRequest.pair_high_id == high,
    ).first()


def _is_mutual_follow(db: Session, user_a_id: int, user_b_id: int) -> bool:
    follow_count = db.query(func.count(models.Follow.id)).filter(
        or_(
            and_(models.Follow.follower_id == user_a_id, models.Follow.following_id == user_b_id),
            and_(models.Follow.follower_id == user_b_id, models.Follow.following_id == user_a_id),
        )
    ).scalar() or 0
    return follow_count == 2


def _can_users_chat(db: Session, user_a_id: int, user_b_id: int) -> bool:
    if user_a_id == user_b_id:
        return False
    if _is_mutual_follow(db, user_a_id, user_b_id):
        return True
    request_row = _chat_request_between(db, user_a_id, user_b_id)
    return request_row is not None and request_row.status == 'accepted'


def _chat_contact_payload(db: Session, current_user_id: int, other: models.User) -> dict:
    is_following = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user_id,
        models.Follow.following_id == other.id,
    ).first() is not None
    is_following_you = db.query(models.Follow).filter(
        models.Follow.follower_id == other.id,
        models.Follow.following_id == current_user_id,
    ).first() is not None
    is_mutual_follow = is_following and is_following_you

    request_row = _chat_request_between(db, current_user_id, other.id)
    request_status = 'none'
    request_id: Optional[int] = None
    if request_row and request_row.status == 'accepted':
        request_status = 'accepted'
    elif request_row and request_row.status == 'pending':
        request_id = request_row.id
        request_status = 'outgoing_pending' if request_row.requester_id == current_user_id else 'incoming_pending'

    can_chat = is_mutual_follow or (request_row is not None and request_row.status == 'accepted')
    return {
        'id': other.id,
        'username': other.username,
        'avatar_url': other.profile.avatar_url if other.profile else '',
        'is_following': is_following,
        'is_following_you': is_following_you,
        'is_mutual_follow': is_mutual_follow,
        'can_chat': can_chat,
        'request_status': request_status,
        'request_id': request_id,
    }


def _cleanup_attempts(ip: str, now_ts: float):
    _login_attempts[ip] = [ts for ts in _login_attempts[ip] if now_ts - ts <= LOGIN_WINDOW_SECONDS]


def _throttle_login(ip: str, now_ts: float):
    _cleanup_attempts(ip, now_ts)
    if len(_login_attempts[ip]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail='Too many login attempts. Please wait a minute.')


def _login_fail(ip: str, now_ts: float):
    _cleanup_attempts(ip, now_ts)
    _login_attempts[ip].append(now_ts)


def _password_reset_secret() -> str:
    return os.getenv('PASSWORD_RESET_OTP_SECRET', os.getenv('JWT_SECRET_KEY', 'terimaa'))


def _hash_password_reset_otp(email: str, otp: str) -> str:
    payload = f'{email.strip().lower()}:{otp.strip()}'.encode('utf-8')
    secret = _password_reset_secret().encode('utf-8')
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _generate_password_reset_otp() -> str:
    return f'{random.randint(0, 999999):06d}'


def _send_password_reset_email(email: str, otp: str, username: str) -> None:
    api_key = os.getenv('RESEND_API_KEY', '').strip()
    from_email = os.getenv('RESEND_FROM_EMAIL', 'onboarding@resend.dev').strip()
    if not api_key:
        raise HTTPException(status_code=500, detail='Password reset email service is not configured')

    subject = 'Your InkLounge password reset OTP'
    greeting_name = (username or 'there').strip()
    html = (
        f'<p>Hi {greeting_name},</p>'
        f'<p>Your OTP for resetting your InkLounge password is:</p>'
        f'<h2 style=\"letter-spacing:3px;\">{otp}</h2>'
        f'<p>This OTP expires in {PASSWORD_RESET_OTP_TTL_MINUTES} minutes.</p>'
        f'<p>If you did not request this, please ignore this email.</p>'
    )
    text = (
        f'Hi {greeting_name},\n\n'
        f'Your OTP for resetting your InkLounge password is: {otp}\n'
        f'This OTP expires in {PASSWORD_RESET_OTP_TTL_MINUTES} minutes.\n\n'
        f'If you did not request this, please ignore this email.'
    )

    payload = {
        'from': from_email,
        'to': [email],
        'subject': subject,
        'html': html,
        'text': text,
    }
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            return
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail='Unable to send OTP email right now') from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail='Unable to send OTP email right now') from exc


def _profile(db: Session, user_id: int) -> models.UserProfile:
    row = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    if row:
        return row
    row = models.UserProfile(user_id=user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _settings(db: Session, user_id: int) -> models.UserSetting:
    row = db.query(models.UserSetting).filter(models.UserSetting.user_id == user_id).first()
    if row:
        return row
    row = models.UserSetting(user_id=user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _notify(
    db: Session,
    recipient_id: int,
    message: str,
    type_: str,
    actor_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
):
    row = models.Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=type_,
        entity_type=entity_type,
        entity_id=entity_id,
        message=message,
    )
    db.add(row)
    db.commit()
    return row


def _feed_items(db: Session, posts: List[models.Post], user_id: int) -> List[dict]:
    if not posts:
        return []

    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    like_counts = {
        row.post_id: row.cnt
        for row in db.query(models.PostReaction.post_id, func.count(models.PostReaction.id).label('cnt'))
        .filter(models.PostReaction.post_id.in_(post_ids))
        .group_by(models.PostReaction.post_id)
        .all()
    }
    comment_counts = {
        row.post_id: row.cnt
        for row in db.query(models.Comment.post_id, func.count(models.Comment.id).label('cnt'))
        .filter(models.Comment.post_id.in_(post_ids))
        .group_by(models.Comment.post_id)
        .all()
    }
    liked = {
        row.post_id
        for row in db.query(models.PostReaction.post_id)
        .filter(models.PostReaction.user_id == user_id, models.PostReaction.post_id.in_(post_ids))
        .all()
    }
    bookmarked = {
        row.post_id
        for row in db.query(models.Bookmark.post_id)
        .filter(models.Bookmark.user_id == user_id, models.Bookmark.post_id.in_(post_ids))
        .all()
    }
    following = {
        row.following_id
        for row in db.query(models.Follow.following_id)
        .filter(models.Follow.follower_id == user_id, models.Follow.following_id.in_(author_ids))
        .all()
    }

    return [
        {
            'id': p.id,
            'title': p.title,
            'content': p.content,
            'image_url': p.image_url,
            'author_id': p.author_id,
            'created_at': p.created_at,
            'author': {
                'id': p.author.id,
                'username': p.author.username,
                'avatar_url': p.author.profile.avatar_url if p.author.profile else "",
            },
            'like_count': like_counts.get(p.id, 0),
            'comment_count': comment_counts.get(p.id, 0),
            'is_liked': p.id in liked,
            'is_bookmarked': p.id in bookmarked,
            'is_following_author': p.author_id in following,
        }
        for p in posts
    ]


# AUTH
@app.post('/users/', response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    existing = db.query(models.User).filter(
        or_(models.User.email == user.email, models.User.username == user.username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail='Username or email already registered')

    row = models.User(
        username=user.username.strip(),
        email=user.email,
        hashed_password=utils.hash_password(user.password),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(models.UserProfile(user_id=row.id))
    db.add(models.UserSetting(user_id=row.id))
    db.commit()
    return row


@app.post('/login', response_model=schemas.LoginResponse)
def login(
    request: Request,
    user_credentials: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db),
):
    ip = request.client.host if request.client else 'unknown'
    now_ts = datetime.utcnow().timestamp()
    _throttle_login(ip, now_ts)

    identity = user_credentials.username.strip()
    user = db.query(models.User).filter(
        or_(models.User.email == identity, models.User.username == identity)
    ).first()

    if not user or not utils.verify_password(user_credentials.password, user.hashed_password):
        _login_fail(ip, now_ts)
        raise HTTPException(status_code=403, detail='Invalid credentials')

    _login_attempts.pop(ip, None)

    access_token = oauth2.create_access_token(data={'user_id': user.id})
    refresh_token = oauth2.create_refresh_token()
    db.add(models.RefreshToken(
        user_id=user.id,
        token_hash=oauth2.hash_token(refresh_token),
        expires_at=oauth2.refresh_token_expiry(),
    ))
    db.commit()

    return {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'bearer',
        'username': user.username,
        'user_id': user.id,
    }


@app.post('/refresh', response_model=schemas.RefreshTokenResponse)
def refresh_access_token(payload: schemas.RefreshTokenRequest, db: Session = Depends(database.get_db)):
    token_row = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == oauth2.hash_token(payload.refresh_token),
        models.RefreshToken.revoked_at.is_(None),
        models.RefreshToken.expires_at > datetime.utcnow(),
    ).first()
    if not token_row:
        raise HTTPException(status_code=401, detail='Invalid refresh token')

    return {
        'access_token': oauth2.create_access_token(data={'user_id': token_row.user_id}),
        'token_type': 'bearer',
    }


@app.post('/logout', status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: schemas.RefreshTokenRequest, db: Session = Depends(database.get_db)):
    token_row = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == oauth2.hash_token(payload.refresh_token)
    ).first()
    if token_row and token_row.revoked_at is None:
        token_row.revoked_at = datetime.utcnow()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post('/password-reset/request', response_model=schemas.ActionMessageResponse)
def request_password_reset(payload: schemas.PasswordResetRequest, db: Session = Depends(database.get_db)):
    generic_response = {'message': 'If this email is registered, an OTP has been sent.'}
    email = payload.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return generic_response

    now = datetime.utcnow()
    db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.user_id == user.id,
        models.PasswordResetOTP.used_at.is_(None),
    ).update({'used_at': now}, synchronize_session=False)

    otp = _generate_password_reset_otp()
    row = models.PasswordResetOTP(
        user_id=user.id,
        email=email,
        otp_hash=_hash_password_reset_otp(email, otp),
        expires_at=now + timedelta(minutes=PASSWORD_RESET_OTP_TTL_MINUTES),
        attempts=0,
    )
    db.add(row)

    try:
        _send_password_reset_email(email, otp, user.username)
    except HTTPException:
        db.rollback()
        raise

    db.commit()
    return generic_response


@app.post('/password-reset/confirm', response_model=schemas.ActionMessageResponse)
def confirm_password_reset(payload: schemas.PasswordResetConfirm, db: Session = Depends(database.get_db)):
    email = payload.email.strip().lower()
    now = datetime.utcnow()
    invalid_otp = HTTPException(status_code=400, detail='Invalid or expired OTP')

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise invalid_otp

    row = db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.user_id == user.id,
        models.PasswordResetOTP.used_at.is_(None),
    ).order_by(models.PasswordResetOTP.created_at.desc()).first()
    if not row:
        raise invalid_otp
    if row.expires_at <= now:
        row.used_at = now
        db.commit()
        raise invalid_otp

    if row.attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
        row.used_at = now
        db.commit()
        raise invalid_otp

    provided_hash = _hash_password_reset_otp(email, payload.otp)
    if not hmac.compare_digest(provided_hash, row.otp_hash):
        row.attempts += 1
        if row.attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
            row.used_at = now
        db.commit()
        raise invalid_otp

    user.hashed_password = utils.hash_password(payload.new_password)
    row.used_at = now
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked_at.is_(None),
    ).update({'revoked_at': now}, synchronize_session=False)
    db.commit()

    return {'message': 'Password reset successful. Please log in with your new password.'}


@app.get('/users/all', response_model=List[schemas.UserPublic])
def get_all_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    return db.query(models.User).filter(models.User.id != current_user.id).all()


@app.get('/users/online', response_model=schemas.OnlineUsersResponse)
def get_online_users(current_user: models.User = Depends(oauth2.get_current_user)):
    return {'online_user_ids': manager.get_online_user_ids()}


@app.get('/chat/contacts', response_model=List[schemas.ChatContactResponse])
def get_chat_contacts(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    users = db.query(models.User).options(joinedload(models.User.profile)).filter(models.User.id != current_user.id).order_by(models.User.username.asc()).all()
    return [_chat_contact_payload(db, current_user.id, row) for row in users]


@app.post('/chat/requests/{user_id}', response_model=schemas.ChatRequestResponse, status_code=status.HTTP_201_CREATED)
def send_chat_request(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='You cannot send a chat request to yourself')

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    if _is_mutual_follow(db, current_user.id, user_id):
        raise HTTPException(status_code=400, detail='You can already chat because you follow each other')

    existing = _chat_request_between(db, current_user.id, user_id)
    if existing and existing.status == 'accepted':
        raise HTTPException(status_code=400, detail='Chat is already enabled for this user')

    if existing and existing.status == 'pending':
        if existing.requester_id == current_user.id:
            raise HTTPException(status_code=400, detail='Chat request already sent')
        raise HTTPException(status_code=400, detail='This user already sent you a request. Please accept it from chat.')

    if existing:
        existing.requester_id = current_user.id
        existing.target_id = user_id
        existing.status = 'pending'
        existing.updated_at = datetime.utcnow()
        row = existing
    else:
        low, high = _pair_ids(current_user.id, user_id)
        row = models.ChatRequest(
            requester_id=current_user.id,
            target_id=user_id,
            pair_low_id=low,
            pair_high_id=high,
            status='pending',
        )
        db.add(row)

    db.commit()
    db.refresh(row)

    _notify(
        db,
        recipient_id=user_id,
        actor_id=current_user.id,
        type_='chat_request',
        entity_type='user',
        entity_id=current_user.id,
        message=f'{current_user.username} sent you a chat request.',
    )
    return row


@app.post('/chat/requests/{request_id}/accept', response_model=schemas.ChatRequestResponse)
def accept_chat_request(request_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.ChatRequest).filter(models.ChatRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Chat request not found')
    if row.target_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized to accept this request')
    if row.status != 'pending':
        raise HTTPException(status_code=400, detail='This request is no longer pending')

    row.status = 'accepted'
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    _notify(
        db,
        recipient_id=row.requester_id,
        actor_id=current_user.id,
        type_='chat_request_accepted',
        entity_type='user',
        entity_id=current_user.id,
        message=f'{current_user.username} accepted your chat request.',
    )
    return row


@app.post('/chat/requests/{request_id}/reject', response_model=schemas.ChatRequestResponse)
def reject_chat_request(request_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.ChatRequest).filter(models.ChatRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Chat request not found')
    if row.target_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized to reject this request')
    if row.status != 'pending':
        raise HTTPException(status_code=400, detail='This request is no longer pending')

    row.status = 'rejected'
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


@app.delete('/chat/requests/{request_id}', response_model=schemas.ChatRequestResponse)
def cancel_chat_request(request_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.ChatRequest).filter(models.ChatRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Chat request not found')
    if row.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized to cancel this request')
    if row.status != 'pending':
        raise HTTPException(status_code=400, detail='Only pending requests can be cancelled')

    row.status = 'cancelled'
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


@app.get('/me/profile', response_model=schemas.UserProfileResponse)
def get_my_profile(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    profile = _profile(db, current_user.id)
    posts_count = db.query(func.count(models.Post.id)).filter(models.Post.author_id == current_user.id).scalar() or 0
    followers_count = db.query(func.count(models.Follow.id)).filter(models.Follow.following_id == current_user.id).scalar() or 0
    following_count = db.query(func.count(models.Follow.id)).filter(models.Follow.follower_id == current_user.id).scalar() or 0

    return {
        'user_id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'bio': profile.bio or '',
        'location': profile.location or '',
        'avatar_url': profile.avatar_url or '',
        'posts_count': posts_count,
        'followers_count': followers_count,
        'following_count': following_count,
    }


@app.put('/me/profile', response_model=schemas.UserProfileResponse)
def update_my_profile(
    payload: schemas.UserProfileUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    profile = _profile(db, current_user.id)
    profile.bio = (payload.bio or '').strip()
    profile.location = (payload.location or '').strip()
    profile.avatar_url = (payload.avatar_url or '').strip()
    profile.updated_at = datetime.utcnow()
    db.commit()
    return get_my_profile(db, current_user)


@app.get('/me/settings', response_model=schemas.UserSettingResponse)
def get_my_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    return _settings(db, current_user.id)


@app.put('/me/settings', response_model=schemas.UserSettingResponse)
def update_my_settings(
    payload: schemas.UserSettingUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    settings = _settings(db, current_user.id)
    settings.email_alerts = payload.email_alerts
    settings.weekly_digest = payload.weekly_digest
    settings.compact_mode = payload.compact_mode
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return settings


@app.post('/users/{user_id}/follow', response_model=schemas.FollowStatusResponse)
def follow_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='You cannot follow yourself')

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    row = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.following_id == user_id,
    ).first()
    if not row:
        db.add(models.Follow(follower_id=current_user.id, following_id=user_id))
        db.commit()
        _notify(
            db,
            recipient_id=user_id,
            actor_id=current_user.id,
            type_='follow',
            entity_type='user',
            entity_id=current_user.id,
            message=f'{current_user.username} started following you.',
        )
    return {'is_following': True}


@app.delete('/users/{user_id}/follow', response_model=schemas.FollowStatusResponse)
def unfollow_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.following_id == user_id,
    )
    if row.first():
        row.delete(synchronize_session=False)
        db.commit()
    return {'is_following': False}


@app.get('/users/{user_id}/follow-status', response_model=schemas.FollowStatusResponse)
def follow_status(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    is_following = db.query(models.Follow).filter(
        models.Follow.follower_id == current_user.id,
        models.Follow.following_id == user_id,
    ).first() is not None
    return {'is_following': is_following}


@app.get('/feed', response_model=List[schemas.FeedPostResponse])
def get_feed(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
    q: Optional[str] = None,
    sort: str = Query('latest', pattern='^(latest|most_liked|most_commented)$'),
    only_following: bool = False,
    limit: int = 20,
    skip: int = 0,
):
    query = db.query(models.Post)
    if q:
        like_q = f"%{q.strip()}%"
        query = query.filter(or_(models.Post.title.ilike(like_q), models.Post.content.ilike(like_q)))
    if only_following:
        query = query.join(
            models.Follow,
            and_(models.Follow.following_id == models.Post.author_id, models.Follow.follower_id == current_user.id),
        )

    feed = _feed_items(db, query.all(), current_user.id)
    if sort == 'most_liked':
        feed.sort(key=lambda row: (row['like_count'], row['created_at']), reverse=True)
    elif sort == 'most_commented':
        feed.sort(key=lambda row: (row['comment_count'], row['created_at']), reverse=True)
    else:
        feed.sort(key=lambda row: row['created_at'], reverse=True)

    return feed[skip:skip + limit]


@app.get('/posts/', response_model=List[schemas.PostResponse])
def get_posts(db: Session = Depends(database.get_db), limit: int = 10, skip: int = 0):
    return db.query(models.Post).options(joinedload(models.Post.author).joinedload(models.User.profile)).order_by(models.Post.created_at.desc()).limit(limit).offset(skip).all()


@app.get('/posts/{post_id}', response_model=schemas.PostResponse)
def get_post(post_id: int, db: Session = Depends(database.get_db)):
    post = db.query(models.Post).options(joinedload(models.Post.author).joinedload(models.User.profile)).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    return post


@app.get('/posts/{post_id}/feed-view', response_model=schemas.FeedPostResponse)
def get_post_feed_view(
    post_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    post = db.query(models.Post).options(joinedload(models.Post.author).joinedload(models.User.profile)).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    return _feed_items(db, [post], current_user.id)[0]


@app.post('/posts/', response_model=schemas.PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(post: schemas.PostCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    title = post.title.strip()
    content = post.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail='Title and content are required')

    row = models.Post(
        title=title,
        content=content,
        image_url=(post.image_url or "").strip(),
        author_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.put('/posts/{post_id}', response_model=schemas.PostResponse)
def update_post(post_id: int, updated_post: schemas.PostCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    query = db.query(models.Post).filter(models.Post.id == post_id)
    post = query.first()
    if post is None:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized')

    next_image_url = post.image_url if updated_post.image_url is None else updated_post.image_url.strip()

    query.update(
        {'title': updated_post.title.strip(), 'content': updated_post.content.strip(), 'image_url': next_image_url},
        synchronize_session=False,
    )
    db.commit()
    return query.first()


@app.delete('/posts/{post_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    query = db.query(models.Post).filter(models.Post.id == post_id)
    post = query.first()
    if post is None:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != current_user.id and not _is_admin(current_user):
        raise HTTPException(status_code=403, detail='Not authorized')

    query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.put('/users/profile/avatar')
async def update_avatar(file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    result = cloudinary.uploader.upload(file.file)
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = models.UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.avatar_url = result['secure_url']
    db.commit()
    return {"avatar_url": result['secure_url']}


@app.post('/posts/{post_id}/bookmark', response_model=schemas.BookmarkStatusResponse)
def bookmark_post(post_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    row = db.query(models.Bookmark).filter(
        models.Bookmark.user_id == current_user.id,
        models.Bookmark.post_id == post_id,
    ).first()
    if not row:
        db.add(models.Bookmark(user_id=current_user.id, post_id=post_id))
        db.commit()

    return {'is_bookmarked': True}


@app.delete('/posts/{post_id}/bookmark', response_model=schemas.BookmarkStatusResponse)
def unbookmark_post(post_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.Bookmark).filter(
        models.Bookmark.user_id == current_user.id,
        models.Bookmark.post_id == post_id,
    )
    if row.first():
        row.delete(synchronize_session=False)
        db.commit()
    return {'is_bookmarked': False}


@app.get('/me/bookmarks', response_model=List[schemas.FeedPostResponse])
def get_my_bookmarks(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    posts = db.query(models.Post).join(
        models.Bookmark,
        and_(models.Bookmark.post_id == models.Post.id, models.Bookmark.user_id == current_user.id),
    ).order_by(models.Bookmark.created_at.desc()).all()
    return _feed_items(db, posts, current_user.id)


@app.post('/posts/{post_id}/reactions', response_model=schemas.ReactionCreate)
def react_to_post(post_id: int, payload: schemas.ReactionCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    row = db.query(models.PostReaction).filter(
        models.PostReaction.user_id == current_user.id,
        models.PostReaction.post_id == post_id,
    ).first()
    if row:
        row.reaction_type = payload.reaction_type
    else:
        db.add(models.PostReaction(user_id=current_user.id, post_id=post_id, reaction_type=payload.reaction_type))
        if post.author_id != current_user.id:
            _notify(
                db,
                recipient_id=post.author_id,
                actor_id=current_user.id,
                type_='post_reaction',
                entity_type='post',
                entity_id=post_id,
                message=f'{current_user.username} reacted to your post.',
            )
    db.commit()
    return payload


@app.delete('/posts/{post_id}/reactions', status_code=status.HTTP_204_NO_CONTENT)
def remove_post_reaction(post_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    row = db.query(models.PostReaction).filter(
        models.PostReaction.user_id == current_user.id,
        models.PostReaction.post_id == post_id,
    )
    if row.first():
        row.delete(synchronize_session=False)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get('/posts/{post_id}/comments/', response_model=List[schemas.CommentResponse])
def get_comments(post_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user), limit: int = 50, skip: int = 0):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    comments = db.query(models.Comment).filter(models.Comment.post_id == post_id).order_by(models.Comment.created_at.asc()).limit(limit).offset(skip).all()
    if not comments:
        return []

    comment_ids = [c.id for c in comments]
    like_counts = {
        row.comment_id: row.cnt
        for row in db.query(models.CommentReaction.comment_id, func.count(models.CommentReaction.id).label('cnt'))
        .filter(models.CommentReaction.comment_id.in_(comment_ids))
        .group_by(models.CommentReaction.comment_id)
        .all()
    }
    liked = {
        row.comment_id
        for row in db.query(models.CommentReaction.comment_id)
        .filter(models.CommentReaction.user_id == current_user.id, models.CommentReaction.comment_id.in_(comment_ids))
        .all()
    }

    return [
        {
            'id': c.id,
            'content': c.content,
            'post_id': c.post_id,
            'author_id': c.author_id,
            'created_at': c.created_at,
            'author': c.author,
            'like_count': like_counts.get(c.id, 0),
            'is_liked': c.id in liked,
        }
        for c in comments
    ]


@app.post('/posts/{post_id}/comments/', response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(post_id: int, comment: schemas.CommentCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    text = comment.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Comment cannot be empty')

    row = models.Comment(content=text, post_id=post_id, author_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)

    if post.author_id != current_user.id:
        _notify(
            db,
            recipient_id=post.author_id,
            actor_id=current_user.id,
            type_='new_comment',
            entity_type='post',
            entity_id=post_id,
            message=f'{current_user.username} commented on your post.',
        )

    return {
        'id': row.id,
        'content': row.content,
        'post_id': row.post_id,
        'author_id': row.author_id,
        'created_at': row.created_at,
        'author': row.author,
        'like_count': 0,
        'is_liked': False,
    }


@app.put('/comments/{comment_id}', response_model=schemas.CommentResponse)
def update_comment(
    comment_id: int,
    payload: schemas.CommentCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    row = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Comment not found')
    if row.author_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized')

    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Comment cannot be empty')

    row.content = text
    db.commit()
    db.refresh(row)

    like_count = db.query(func.count(models.CommentReaction.id)).filter(
        models.CommentReaction.comment_id == row.id
    ).scalar() or 0
    is_liked = db.query(models.CommentReaction).filter(
        models.CommentReaction.comment_id == row.id,
        models.CommentReaction.user_id == current_user.id,
    ).first() is not None
    return {
        'id': row.id,
        'content': row.content,
        'post_id': row.post_id,
        'author_id': row.author_id,
        'created_at': row.created_at,
        'author': row.author,
        'like_count': like_count,
        'is_liked': is_liked,
    }


@app.delete('/comments/{comment_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    query = db.query(models.Comment).filter(models.Comment.id == comment_id)
    row = query.first()
    if not row:
        raise HTTPException(status_code=404, detail='Comment not found')
    if row.author_id != current_user.id and not _is_admin(current_user):
        raise HTTPException(status_code=403, detail='Not authorized')
    query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get('/comments/{comment_id}/post')
def get_comment_post(
    comment_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail='Comment not found')
    return {'post_id': comment.post_id}


@app.post('/comments/{comment_id}/reactions', response_model=schemas.ReactionCreate)
def react_to_comment(
    comment_id: int,
    payload: schemas.ReactionCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail='Comment not found')

    row = db.query(models.CommentReaction).filter(
        models.CommentReaction.user_id == current_user.id,
        models.CommentReaction.comment_id == comment_id,
    ).first()
    if row:
        row.reaction_type = payload.reaction_type
    else:
        db.add(models.CommentReaction(
            user_id=current_user.id,
            comment_id=comment_id,
            reaction_type=payload.reaction_type,
        ))
        if comment.author_id != current_user.id:
            _notify(
                db,
                recipient_id=comment.author_id,
                actor_id=current_user.id,
                type_='comment_reaction',
                entity_type='comment',
                entity_id=comment.id,
                message=f'{current_user.username} reacted to your comment.',
            )
    db.commit()
    return payload


@app.delete('/comments/{comment_id}/reactions', status_code=status.HTTP_204_NO_CONTENT)
def remove_comment_reaction(
    comment_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    row = db.query(models.CommentReaction).filter(
        models.CommentReaction.user_id == current_user.id,
        models.CommentReaction.comment_id == comment_id,
    )
    if row.first():
        row.delete(synchronize_session=False)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get('/notifications', response_model=List[schemas.NotificationResponse])
def get_notifications(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
    limit: int = 30,
    skip: int = 0,
):
    return db.query(models.Notification).filter(
        models.Notification.recipient_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(limit).offset(skip).all()


@app.get('/notifications/unread-count', response_model=schemas.UnreadCountResponse)
def get_unread_count(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    unread = db.query(func.count(models.Notification.id)).filter(
        models.Notification.recipient_id == current_user.id,
        models.Notification.is_read.is_(False),
    ).scalar() or 0
    return {'unread_count': unread}


@app.post('/notifications/read-all', status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    db.query(models.Notification).filter(
        models.Notification.recipient_id == current_user.id,
        models.Notification.is_read.is_(False),
    ).update({'is_read': True}, synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post('/notifications/{notification_id}/read', response_model=schemas.NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    row = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.recipient_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail='Notification not found')
    if not row.is_read:
        row.is_read = True
        db.commit()
        db.refresh(row)
    return row


@app.post('/reports', response_model=schemas.ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: schemas.ReportCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    if payload.target_type == 'post':
        target_exists = db.query(models.Post).filter(models.Post.id == payload.target_id).first() is not None
    elif payload.target_type == 'comment':
        target_exists = db.query(models.Comment).filter(models.Comment.id == payload.target_id).first() is not None
    else:
        target_exists = db.query(models.User).filter(models.User.id == payload.target_id).first() is not None

    if not target_exists:
        raise HTTPException(status_code=404, detail='Target not found')

    existing_open = db.query(models.Report).filter(
        models.Report.reporter_id == current_user.id,
        models.Report.target_type == payload.target_type,
        models.Report.target_id == payload.target_id,
        models.Report.status.in_(['open', 'in_review']),
    ).first()
    if existing_open:
        raise HTTPException(status_code=400, detail='An active report already exists for this target')

    row = models.Report(
        reporter_id=current_user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get('/moderation/reports', response_model=List[schemas.ReportResponse])
def moderation_reports(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
    status_filter: Optional[str] = Query(None, pattern='^(open|in_review|resolved|dismissed)$'),
    limit: int = 100,
    skip: int = 0,
):
    _require_admin(current_user)
    query = db.query(models.Report)
    if status_filter:
        query = query.filter(models.Report.status == status_filter)
    return query.order_by(models.Report.created_at.desc()).limit(limit).offset(skip).all()


@app.get('/moderation/summary', response_model=schemas.ModerationSummary)
def moderation_summary(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    _require_admin(current_user)
    open_reports = db.query(func.count(models.Report.id)).filter(models.Report.status == 'open').scalar() or 0
    in_review_reports = db.query(func.count(models.Report.id)).filter(models.Report.status == 'in_review').scalar() or 0
    resolved_reports = db.query(func.count(models.Report.id)).filter(models.Report.status == 'resolved').scalar() or 0
    return {
        'open_reports': open_reports,
        'in_review_reports': in_review_reports,
        'resolved_reports': resolved_reports,
    }


@app.patch('/moderation/reports/{report_id}', response_model=schemas.ReportResponse)
def moderation_update_report(
    report_id: int,
    payload: schemas.ReportUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    _require_admin(current_user)
    row = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Report not found')

    row.status = payload.status
    row.admin_note = (payload.admin_note or '').strip() or None
    row.reviewed_by = current_user.id
    row.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def _message_to_response(db: Session, message: models.Message) -> dict:
    is_read = db.query(models.MessageReceipt).filter(
        models.MessageReceipt.message_id == message.id
    ).first() is not None
    return {
        'id': message.id,
        'sender_id': message.sender_id,
        'receiver_id': message.receiver_id,
        'content': message.content,
        'created_at': message.created_at,
        'is_read': is_read,
        'type': 'message',
    }


@app.get('/messages/{other_user_id}', response_model=List[schemas.MessageResponse])
def get_messages(
    other_user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    other = db.query(models.User).filter(models.User.id == other_user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail='User not found')
    if not _can_users_chat(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail='You can only chat with mutual follows or accepted requests')

    rows = db.query(models.Message).filter(
        or_(
            and_(models.Message.sender_id == current_user.id, models.Message.receiver_id == other_user_id),
            and_(models.Message.sender_id == other_user_id, models.Message.receiver_id == current_user.id),
        )
    ).order_by(models.Message.created_at.asc()).all()

    return [_message_to_response(db, row) for row in rows]


@app.post('/messages/', response_model=schemas.MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: schemas.MessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    if payload.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail='Cannot message yourself')

    receiver = db.query(models.User).filter(models.User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail='Receiver not found')
    if not _can_users_chat(db, current_user.id, payload.receiver_id):
        raise HTTPException(status_code=403, detail='You can only chat with mutual follows or accepted requests')

    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Message cannot be empty')

    row = models.Message(sender_id=current_user.id, receiver_id=payload.receiver_id, content=text)
    db.add(row)
    db.commit()
    db.refresh(row)

    response_payload = _message_to_response(db, row)

    await manager.send_personal_message(response_payload, payload.receiver_id)
    await manager.send_personal_message(response_payload, current_user.id)

    _notify(
        db,
        recipient_id=payload.receiver_id,
        actor_id=current_user.id,
        type_='new_message',
        entity_type='message',
        entity_id=row.id,
        message=f'{current_user.username} sent you a message.',
    )

    return response_payload


@app.post('/messages/{other_user_id}/read', response_model=schemas.MessageReadResponse)
async def mark_conversation_read(
    other_user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    if not _can_users_chat(db, current_user.id, other_user_id):
        raise HTTPException(status_code=403, detail='You can only chat with mutual follows or accepted requests')

    incoming = db.query(models.Message).filter(
        models.Message.sender_id == other_user_id,
        models.Message.receiver_id == current_user.id,
    ).all()
    if not incoming:
        return {'marked_count': 0}

    message_ids = [row.id for row in incoming]
    already_read_ids = {
        row.message_id
        for row in db.query(models.MessageReceipt.message_id).filter(
            models.MessageReceipt.message_id.in_(message_ids)
        ).all()
    }
    unread_ids = [mid for mid in message_ids if mid not in already_read_ids]
    if not unread_ids:
        return {'marked_count': 0}

    for message_id in unread_ids:
        db.add(models.MessageReceipt(message_id=message_id, receiver_id=current_user.id))
    db.commit()

    await manager.send_personal_message(
        {
            'type': 'read',
            'sender_id': current_user.id,
            'receiver_id': other_user_id,
            'read_at': datetime.utcnow().isoformat(),
            'count': len(unread_ids),
        },
        other_user_id,
    )

    return {'marked_count': len(unread_ids)}


@app.websocket('/ws/chat/{user_id}')
async def websocket_chat(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            event_type = data.get('type')

            if event_type == 'typing':
                receiver_id = int(data.get('receiver_id', 0))
                if receiver_id > 0:
                    db = database.SessionLocal()
                    try:
                        can_chat = _can_users_chat(db, user_id, receiver_id)
                    finally:
                        db.close()
                    if not can_chat:
                        continue
                    await manager.send_personal_message(
                        {
                            'type': 'typing',
                            'sender_id': user_id,
                            'receiver_id': receiver_id,
                            'is_typing': bool(data.get('is_typing')),
                        },
                        receiver_id,
                    )
                continue

            if event_type == 'read':
                receiver_id = int(data.get('receiver_id', 0))
                if receiver_id > 0:
                    db = database.SessionLocal()
                    try:
                        can_chat = _can_users_chat(db, user_id, receiver_id)
                    finally:
                        db.close()
                    if not can_chat:
                        continue
                    await manager.send_personal_message(
                        {
                            'type': 'read',
                            'sender_id': user_id,
                            'receiver_id': receiver_id,
                            'read_at': datetime.utcnow().isoformat(),
                        },
                        receiver_id,
                    )
                continue

            if event_type == 'ping':
                await websocket.send_json({'type': 'pong'})
                continue
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)
