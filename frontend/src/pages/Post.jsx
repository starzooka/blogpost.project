import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';

function Post() {
  const { id } = useParams();
  const navigate = useNavigate(); // Used to redirect after deleting a post
  
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [newComment, setNewComment] = useState('');
  const [commentError, setCommentError] = useState('');

  // --- NEW EDITING STATES ---
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editPostTitle, setEditPostTitle] = useState('');
  const [editPostContent, setEditPostContent] = useState('');

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  
  const isLoggedIn = !!localStorage.getItem('access_token');
  // Grab the logged-in user's ID and convert it to a number for comparison
  const currentUserId = parseInt(localStorage.getItem('user_id')); 

  useEffect(() => {
    fetchPostAndComments();
  }, [id]);

  const fetchPostAndComments = async () => {
    try {
      const postResponse = await api.get(`/posts/${id}`);
      setPost(postResponse.data);
      setEditPostTitle(postResponse.data.title);
      setEditPostContent(postResponse.data.content);
      
      const commentsResponse = await api.get(`/posts/${id}/comments/`);
      setComments(commentsResponse.data);
      setLoading(false);
    } catch (err) {
      setError("Failed to load data.");
      setLoading(false);
    }
  };

  // --- POST ACTIONS ---
  const handleUpdatePost = async () => {
    try {
      await api.put(`/posts/${id}`, { title: editPostTitle, content: editPostContent });
      setIsEditingPost(false);
      fetchPostAndComments(); // Refresh to show updates
    } catch (err) {
      alert("Failed to update post.");
    }
  };

  const handleDeletePost = async () => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      try {
        await api.delete(`/posts/${id}`);
        navigate('/'); // Send them back to the feed after deleting
      } catch (err) {
        alert("Failed to delete post.");
      }
    }
  };

  // --- COMMENT ACTIONS ---
  const handleAddComment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/posts/${id}/comments/`, { content: newComment });
      setNewComment(''); 
      fetchPostAndComments(); 
    } catch (err) {
      setCommentError("Failed to post comment.");
    }
  };

  const handleUpdateComment = async (commentId) => {
    try {
      await api.put(`/comments/${commentId}`, { content: editCommentContent });
      setEditingCommentId(null);
      fetchPostAndComments();
    } catch (err) {
      alert("Failed to update comment.");
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (window.confirm("Delete this comment?")) {
      try {
        await api.delete(`/comments/${commentId}`);
        fetchPostAndComments();
      } catch (err) {
        alert("Failed to delete comment.");
      }
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading...</div>;
  if (error || !post) return <div style={{ textAlign: 'center', marginTop: '50px' }}>Post not found.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>
        
        <Link to="/" style={{ display: 'inline-block', marginBottom: '20px', textDecoration: 'none', color: '#007BFF', fontWeight: 'bold' }}>
          &larr; Back to Feed
        </Link>

        {/* --- MAIN POST --- */}
        <div style={{ padding: '30px', borderRadius: '8px', backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: '30px', border: '1px solid #e0e0e0' }}>
          
          {/* Conditional Rendering: Edit Mode vs View Mode */}
          {isEditingPost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input value={editPostTitle} onChange={(e) => setEditPostTitle(e.target.value)} style={{ padding: '8px', fontSize: '1.2em' }} />
              <textarea value={editPostContent} onChange={(e) => setEditPostContent(e.target.value)} rows="5" style={{ padding: '8px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleUpdatePost} style={{ padding: '6px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                <button onClick={() => setIsEditingPost(false)} style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ marginTop: '0', marginBottom: '15px', color: '#222' }}>{post.title}</h1>
              <p style={{ color: '#444', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '1.1em' }}>{post.content}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '25px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                <div style={{ fontSize: '0.9em', color: '#888' }}>
                  {/* Change this line to use post.author.username */}
                  Posted by <span style={{ fontWeight: 'bold', color: '#555' }}>{post.author?.username}</span> on {new Date(post.created_at).toLocaleDateString()}
                </div>
                
                {/* Check if current user authored the post to show Edit/Delete */}
                {post.author_id === currentUserId && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setIsEditingPost(true)} style={{ padding: '4px 10px', background: '#ffc107', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                    <button onClick={handleDeletePost} style={{ padding: '4px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* --- COMMENTS SECTION --- */}
        <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: '0', marginBottom: '20px', color: '#333' }}>Comments ({comments.length})</h3>

          {/* Comment Form */}
          {isLoggedIn ? (
            <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px' }}>
              <textarea placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} required rows="2" style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
              <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-end' }}>Comment</button>
            </form>
          ) : (
            <div style={{ marginBottom: '30px', color: '#666' }}>Please log in to comment.</div>
          )}

          {/* Comments List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {comments.map((comment) => (
              <div key={comment.id} style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#ffffff', border: '1px solid #eee' }}>
                
                {/* Edit Mode vs View Mode for Comments */}
                {editingCommentId === comment.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea value={editCommentContent} onChange={(e) => setEditCommentContent(e.target.value)} rows="2" style={{ padding: '8px' }} />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => handleUpdateComment(comment.id)} style={{ padding: '4px 8px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingCommentId(null)} style={{ padding: '4px 8px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: '0 0 10px 0', color: '#444', whiteSpace: 'pre-wrap' }}>{comment.content}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#999' }}>
                      <span>
                        <strong style={{ color: '#555' }}>{comment.author?.username}</strong> • {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                      
                      {/* Check if current user authored the comment */}
                      {comment.author_id === currentUserId && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setEditingCommentId(comment.id); setEditCommentContent(comment.content); }} style={{ background: 'none', border: 'none', color: '#007BFF', cursor: 'pointer', padding: 0 }}>Edit</button>
                          <button onClick={() => handleDeleteComment(comment.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', padding: 0 }}>Delete</button>
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Post;