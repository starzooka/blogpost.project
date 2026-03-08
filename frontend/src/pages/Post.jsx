import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';

function Post() {
  const { id } = useParams();
  const navigate = useNavigate();
  const postId = Number(id);

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [newComment, setNewComment] = useState('');

  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editPostTitle, setEditPostTitle] = useState('');
  const [editPostContent, setEditPostContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentContent, setEditCommentContent] = useState('');

  const currentUserId = Number(localStorage.getItem('user_id') || 0);
  const isOwnPost = post?.author_id === currentUserId;

  const fetchPostAndComments = useCallback(async () => {
    if (!Number.isInteger(postId)) {
      setError('Invalid post.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const [postResponse, commentsResponse] = await Promise.all([
        api.get(`/posts/${postId}/feed-view`),
        api.get(`/posts/${postId}/comments/`, { params: { limit: 100 } }),
      ]);
      const postData = postResponse.data;
      setPost(postData);
      setComments(commentsResponse.data);
      setEditPostTitle(postData.title);
      setEditPostContent(postData.content);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load post.');
      setPost(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchPostAndComments();
  }, [fetchPostAndComments]);

  const handleUpdatePost = async () => {
    const cleanTitle = editPostTitle.trim();
    const cleanContent = editPostContent.trim();
    if (!cleanTitle || !cleanContent) {
      setFormError('Title and content are required.');
      return;
    }
    setFormError('');
    try {
      await api.put(`/posts/${postId}`, { title: cleanTitle, content: cleanContent });
      setIsEditingPost(false);
      await fetchPostAndComments();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to update post.');
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post permanently?')) return;
    try {
      await api.delete(`/posts/${postId}`);
      navigate('/');
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Failed to delete post.');
    }
  };

  const handleAddComment = async (event) => {
    event.preventDefault();
    const cleanComment = newComment.trim();
    if (!cleanComment) return;

    try {
      const response = await api.post(`/posts/${postId}/comments/`, { content: cleanComment });
      setComments((prev) => [...prev, response.data]);
      setPost((prev) => (prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev));
      setNewComment('');
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to post comment.');
    }
  };

  const handleUpdateComment = async (commentId) => {
    const cleanComment = editCommentContent.trim();
    if (!cleanComment) return;
    try {
      const response = await api.put(`/comments/${commentId}`, { content: cleanComment });
      setComments((prev) => prev.map((row) => (row.id === commentId ? response.data : row)));
      setEditingCommentId(null);
      setEditCommentContent('');
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to update comment.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((row) => row.id !== commentId));
      setPost((prev) => (prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count || 0) - 1) } : prev));
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to delete comment.');
    }
  };

  const togglePostLike = async () => {
    if (!post) return;
    const snapshot = post;
    const nextLiked = !post.is_liked;
    setPost({
      ...post,
      is_liked: nextLiked,
      like_count: Math.max(0, post.like_count + (nextLiked ? 1 : -1)),
    });
    try {
      if (nextLiked) {
        await api.post(`/posts/${post.id}/reactions`, { reaction_type: 'like' });
      } else {
        await api.delete(`/posts/${post.id}/reactions`);
      }
    } catch {
      setPost(snapshot);
      setFormError('Failed to update post reaction.');
    }
  };

  const toggleBookmark = async () => {
    if (!post) return;
    const snapshot = post;
    const nextValue = !post.is_bookmarked;
    setPost({ ...post, is_bookmarked: nextValue });
    try {
      if (nextValue) {
        await api.post(`/posts/${post.id}/bookmark`);
      } else {
        await api.delete(`/posts/${post.id}/bookmark`);
      }
    } catch {
      setPost(snapshot);
      setFormError('Failed to update bookmark.');
    }
  };

  const toggleFollowAuthor = async () => {
    if (!post || post.author_id === currentUserId) return;
    const snapshot = post;
    const nextValue = !post.is_following_author;
    setPost({ ...post, is_following_author: nextValue });
    try {
      if (nextValue) {
        await api.post(`/users/${post.author_id}/follow`);
      } else {
        await api.delete(`/users/${post.author_id}/follow`);
      }
    } catch {
      setPost(snapshot);
      setFormError('Failed to update follow status.');
    }
  };

  const toggleCommentLike = async (comment) => {
    const nextLiked = !comment.is_liked;
    setComments((prev) => prev.map((row) => (
      row.id === comment.id
        ? { ...row, is_liked: nextLiked, like_count: Math.max(0, row.like_count + (nextLiked ? 1 : -1)) }
        : row
    )));
    try {
      if (nextLiked) {
        await api.post(`/comments/${comment.id}/reactions`, { reaction_type: 'like' });
      } else {
        await api.delete(`/comments/${comment.id}/reactions`);
      }
    } catch {
      setComments((prev) => prev.map((row) => (row.id === comment.id ? comment : row)));
      setFormError('Failed to update comment reaction.');
    }
  };

  const reportItem = async (targetType, targetId) => {
    const reason = window.prompt('Report reason (min 5 characters):');
    if (!reason) return;
    try {
      await api.post('/reports', { target_type: targetType, target_id: targetId, reason });
      window.alert('Report submitted.');
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Failed to submit report.');
    }
  };

  if (loading) return <div className="status-text">Loading...</div>;
  if (error || !post) return <div className="status-text status-error">Post not found.</div>;

  return (
    <section className="page page-post">
      <div className="post-container">
        <Link to="/" className="back-link">
          &larr; Back to Feed
        </Link>

        <article className="card post-detail-card">
          {isEditingPost ? (
            <div className="form-stack">
              <input value={editPostTitle} onChange={(event) => setEditPostTitle(event.target.value)} />
              <textarea
                value={editPostContent}
                onChange={(event) => setEditPostContent(event.target.value)}
                rows="8"
              />
              <div className="inline-actions">
                <button type="button" onClick={handleUpdatePost} className="btn btn-accent">Save</button>
                <button type="button" onClick={() => setIsEditingPost(false)} className="btn btn-muted">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="post-detail-title">{post.title}</h1>
              <p className="post-detail-content">{post.content}</p>

              <div className="post-detail-footer">
                <div className="post-detail-meta">
                  Posted by <span>{post.author?.username}</span> on {new Date(post.created_at).toLocaleDateString()}
                </div>

                <div className="inline-actions">
                  <button type="button" className="btn btn-muted" onClick={togglePostLike}>
                    {post.is_liked ? 'Unlike' : 'Like'} ({post.like_count})
                  </button>
                  <button type="button" className="btn btn-muted" onClick={toggleBookmark}>
                    {post.is_bookmarked ? 'Saved' : 'Save'}
                  </button>
                  {post.author_id !== currentUserId && (
                    <button type="button" className="btn btn-muted" onClick={toggleFollowAuthor}>
                      {post.is_following_author ? 'Following' : 'Follow'}
                    </button>
                  )}
                  {!isOwnPost && (
                    <button type="button" className="btn btn-muted" onClick={() => reportItem('post', post.id)}>
                      Report
                    </button>
                  )}
                  {isOwnPost && (
                    <>
                      <button type="button" onClick={() => setIsEditingPost(true)} className="btn btn-warn">Edit</button>
                      <button type="button" onClick={handleDeletePost} className="btn btn-danger">Delete</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </article>

        <section className="card comments-card">
          <h3>Comments ({comments.length})</h3>

          <form onSubmit={handleAddComment} className="form-stack comment-form">
            <textarea
              placeholder="Write a comment..."
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              required
              rows="3"
            />
            <button type="submit" className="btn btn-primary">Comment</button>
          </form>

          {formError && <div className="form-error">{formError}</div>}

          <div className="comment-list">
            {comments.map((comment) => (
              <article key={comment.id} className="comment-item">
                {editingCommentId === comment.id ? (
                  <div className="form-stack">
                    <textarea
                      value={editCommentContent}
                      onChange={(event) => setEditCommentContent(event.target.value)}
                      rows="3"
                    />
                    <div className="inline-actions">
                      <button type="button" onClick={() => handleUpdateComment(comment.id)} className="btn btn-accent">Save</button>
                      <button type="button" onClick={() => setEditingCommentId(null)} className="btn btn-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="comment-content">{comment.content}</p>
                    <div className="comment-meta-row">
                      <span>
                        <strong>{comment.author?.username}</strong> - {new Date(comment.created_at).toLocaleDateString()}
                      </span>

                      <div className="inline-actions">
                        <button type="button" onClick={() => toggleCommentLike(comment)} className="btn-link">
                          {comment.is_liked ? 'Unlike' : 'Like'} ({comment.like_count})
                        </button>
                        {comment.author_id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => reportItem('comment', comment.id)}
                            className="btn-link"
                          >
                            Report
                          </button>
                        )}
                        {comment.author_id === currentUserId && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditCommentContent(comment.content);
                              }}
                              className="btn-link"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              className="btn-link btn-link-danger"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export default Post;
