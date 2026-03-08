from collections import defaultdict
from datetime import datetime
from typing import List, Optional
import json

from fastapi import FastAPI, Depends, HTTPException, status, Response, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from Backend import models, schemas, database, utils, oauth2
from .manager import manager

app = FastAPI(title='Community Blog API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

LOGIN_WINDOW_SECONDS = 60
MAX_LOGIN_ATTEMPTS = 12
_login_attempts: dict[str, list[float]] = defaultdict(list)


@app.on_event('startup')
def startup() -> None:
    database.Base.metadata.create_all(bind=database.engine)


@app.get('/')
def read_root():
    return {'message': 'Welcome to the Community Blog API!'}


def _is_admin(user: models.User) -> bool:
    return user.id == 1 or user.username.lower() == 'admin'


def _require_admin(user: models.User):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail='Admin access required')


def _cleanup_attempts(ip: str, now_ts: float):
    _login_attempts[ip] = [ts for ts in _login_attempts[ip] if now_ts - ts <= LOGIN_WINDOW_SECONDS]


def _throttle_login(ip: str, now_ts: float):
    _cleanup_attempts(ip, now_ts)
    if len(_login_attempts[ip]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail='Too many login attempts. Please wait a minute.')


def _login_fail(ip: str, now_ts: float):
    _cleanup_attempts(ip, now_ts)
    _login_attempts[ip].append(now_ts)


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
            'author_id': p.author_id,
            'created_at': p.created_at,
            'author': p.author,
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


@app.get('/users/all', response_model=List[schemas.UserPublic])
def get_all_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    return db.query(models.User).filter(models.User.id != current_user.id).all()


@app.get('/users/online', response_model=schemas.OnlineUsersResponse)
def get_online_users(current_user: models.User = Depends(oauth2.get_current_user)):
    return {'online_user_ids': manager.get_online_user_ids()}


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
    return db.query(models.Post).order_by(models.Post.created_at.desc()).limit(limit).offset(skip).all()


@app.get('/posts/{post_id}', response_model=schemas.PostResponse)
def get_post(post_id: int, db: Session = Depends(database.get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    return post


@app.get('/posts/{post_id}/feed-view', response_model=schemas.FeedPostResponse)
def get_post_feed_view(
    post_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    return _feed_items(db, [post], current_user.id)[0]


@app.post('/posts/', response_model=schemas.PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(post: schemas.PostCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    title = post.title.strip()
    content = post.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail='Title and content are required')

    row = models.Post(title=title, content=content, author_id=current_user.id)
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

    query.update(
        {'title': updated_post.title.strip(), 'content': updated_post.content.strip()},
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
