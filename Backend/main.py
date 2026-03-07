from fastapi import FastAPI, Depends, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from Backend import models,schemas,database,utils,oauth2
from typing import List

app = FastAPI(title="Community Blog API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Community Blog API!"}

# --- USER REGISTRATION ---
@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # HASH THE PASSWORD HERE
    hashed_pw = utils.hash_password(user.password)
    
    new_user = models.User(
        username=user.username, 
        email=user.email, 
        hashed_password=hashed_pw # Save the hash, not the plain text!
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# --- LOGIN ENDPOINT ---
@app.post("/login")
def login(user_credentials: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    # OAuth2PasswordRequestForm uses 'username' by default, but we will pass the user's email into it from the frontend
    user = db.query(models.User).filter(
        or_(
            models.User.email == user_credentials.username,
            models.User.username == user_credentials.username
        )
    ).first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Credentials")
    
    if not utils.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Credentials")
    
    # Generate the JWT Token
    access_token = oauth2.create_access_token(data={"user_id": user.id})
    
    return {"access_token": access_token, "token_type": "bearer","username": user.username,"user_id": user.id}

# --- BLOG POST ROUTES ---

@app.get("/posts/", response_model=List[schemas.PostResponse])
def get_posts(db: Session = Depends(database.get_db), limit: int = 10, skip: int = 0):
    # This fetches all posts. We added limit and skip for basic pagination!
    posts = db.query(models.Post).limit(limit).offset(skip).all()
    return posts

@app.get("/posts/{post_id}", response_model=schemas.PostResponse)
def get_post(post_id: int, db: Session = Depends(database.get_db)):
    # This fetches a single post by its ID
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    
    return post

@app.post("/posts/", response_model=schemas.PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    post: schemas.PostCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user) # <-- THE MAGIC LOCK!
):
    # Create the new post and automatically assign the logged-in user as the author
    new_post = models.Post(
        title=post.title,
        content=post.content,
        author_id=current_user.id 
    )
    
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    
    return new_post

@app.put("/posts/{post_id}", response_model=schemas.PostResponse)
def update_post(
    post_id: int, 
    updated_post: schemas.PostCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user)
):
    # 1. Find the specific post
    post_query = db.query(models.Post).filter(models.Post.id == post_id)
    post = post_query.first()
    
    # 2. Check if it exists
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        
    # 3. Security Check: Is the logged-in user the actual author?
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to perform requested action")
        
    # 4. Update and save
    post_query.update(updated_post.model_dump(), synchronize_session=False)
    db.commit()
    
    return post_query.first()

@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user)
):
    # 1. Find the specific post
    post_query = db.query(models.Post).filter(models.Post.id == post_id)
    post = post_query.first()
    
    # 2. Check if it exists
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        
    # 3. Security Check: Is the logged-in user the actual author?
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to perform requested action")
        
    # 4. Delete and save
    post_query.delete(synchronize_session=False)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- COMMENT ROUTES ---
@app.get("/posts/{post_id}/comments/", response_model=List[schemas.CommentResponse])
def get_comments(post_id: int, db: Session = Depends(database.get_db), limit: int = 50, skip: int = 0):
    # 1. Verify the post actually exists first
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    
    # 2. Fetch comments linked to that specific post
    comments = db.query(models.Comment).filter(models.Comment.post_id == post_id).limit(limit).offset(skip).all()
    return comments

@app.post("/posts/{post_id}/comments/", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    post_id: int,
    comment: schemas.CommentCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user)
):
    # 1. Verify the post exists
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    # 2. Create the comment, linking both the post_id and the logged-in user's id
    new_comment = models.Comment(
        content=comment.content,
        post_id=post_id,
        author_id=current_user.id 
    )
    
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    return new_comment

@app.put("/comments/{comment_id}", response_model=schemas.CommentResponse)
def update_comment(
    comment_id: int, 
    updated_comment: schemas.CommentCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user)
):
    comment_query = db.query(models.Comment).filter(models.Comment.id == comment_id)
    comment = comment_query.first()
    
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        
    # Security Check: Only the comment author can edit it
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to perform requested action")
        
    comment_query.update(updated_comment.model_dump(), synchronize_session=False)
    db.commit()
    
    return comment_query.first()

@app.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(oauth2.get_current_user)
):
    comment_query = db.query(models.Comment).filter(models.Comment.id == comment_id)
    comment = comment_query.first()
    
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        
    # Security Check: Only the comment author can delete it
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to perform requested action")
        
    comment_query.delete(synchronize_session=False)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)