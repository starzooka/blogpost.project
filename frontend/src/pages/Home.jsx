import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Imported Link for routing
import api from '../api';

function Home() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postError, setPostError] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  
  const isLoggedIn = !!localStorage.getItem('access_token'); 

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await api.get('/posts/');
      setPosts(response.data.reverse()); // Show newest posts first
      setLoading(false);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setError("Failed to load posts.");
      setLoading(false);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    setPostError('');

    try {
      await api.post('/posts/', { title, content });
      setTitle('');   
      setContent(''); 
      setShowForm(false); 
      fetchPosts();   
    } catch (err) {
      console.error("Failed to create post:", err);
      setPostError(err.response?.data?.detail || "Failed to create post. Are you logged in?");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading posts...</div>;
  if (error) return <div style={{ color: 'red', textAlign: 'center', marginTop: '50px' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>Community Feed</h1>
        
        {/* --- TOGGLE CREATE POST BUTTON --- */}
        {isLoggedIn && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <button 
              onClick={() => setShowForm(!showForm)}
              style={{ padding: '10px 20px', backgroundColor: showForm ? '#6c757d' : '#007BFF', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}
            >
              {showForm ? 'Cancel' : '+ Create New Post'}
            </button>
          </div>
        )}

        {/* --- CREATE POST FORM --- */}
        {showForm && isLoggedIn && (
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
            <h3 style={{ marginTop: '0', marginBottom: '15px' }}>Share your views</h3>
            {postError && <div style={{ color: 'red', marginBottom: '10px' }}>{postError}</div>}
            
            <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input 
                type="text" 
                placeholder="Post Title" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
              />
              <textarea 
                placeholder="What's on your mind?" 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                required 
                rows="3"
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />
              <button 
                type="submit" 
                style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', alignSelf: 'flex-end' }}
              >
                Post
              </button>
            </form>
          </div>
        )}

        {/* --- BLOG FEED --- */}
        {posts.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666' }}>No posts yet. Be the first to share!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {posts.map((post) => (
              <div key={post.id} style={{ padding: '20px', borderRadius: '8px', backgroundColor: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                
                {/* Clickable Title linked to the specific Post view */}
                <Link to={`/post/${post.id}`} style={{ textDecoration: 'none' }}>
                  <h2 style={{ marginTop: '0', marginBottom: '10px', color: '#007BFF' }}>
                    {post.title}
                  </h2>
                </Link>
                
                <p style={{ color: '#444', lineHeight: '1.6', whiteSpace: 'pre-wrap', margin: 0 }}>{post.content}</p>
                <div style={{ fontSize: '0.85em', color: '#888', marginTop: '20px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                  {/* Change this line to use post.author.username */}
                  <span style={{ fontWeight: 'bold' }}>Posted by: {post.author?.username}</span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;