import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function SavedPosts() {
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSavedPosts = async () => {
      try {
        const response = await api.get('/me/bookmarks');
        setSavedPosts(response.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load saved posts.');
      } finally {
        setLoading(false);
      }
    };

    fetchSavedPosts();
  }, []);

  const unsavePost = async (postId) => {
    try {
      await api.delete(`/posts/${postId}/bookmark`);
      setSavedPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove saved post.');
    }
  };

  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>Saved Posts</h1>
        <p>Quick access to every article you bookmarked.</p>
      </header>

      {loading ? (
        <div className="status-text">Loading saved posts...</div>
      ) : error ? (
        <div className="status-text status-error">{error}</div>
      ) : savedPosts.length === 0 ? (
        <article className="card account-main">
          <h2>No saved posts yet</h2>
          <p className="status-text">Bookmark a post from the feed and it will appear here.</p>
          <Link to="/" className="btn btn-primary settings-save">Go to Feed</Link>
        </article>
      ) : (
        <div className="saved-list">
          {savedPosts.map((post) => (
            <article key={post.id} className="card saved-item">
              <h3>{post.title}</h3>
              <p>{post.content}</p>
              <div className="inline-actions">
                <Link to={`/post/${post.id}`} className="btn btn-primary">Open Post</Link>
                <button type="button" className="btn btn-muted" onClick={() => unsavePost(post.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default SavedPosts;
