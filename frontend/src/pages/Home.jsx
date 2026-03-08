import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function Home() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sort, setSort] = useState('latest');
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [onlyFollowing, setOnlyFollowing] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showComposer, setShowComposer] = useState(false);

  const currentUserId = Number(localStorage.getItem('user_id') || 0);
  const isLoggedIn = Boolean(localStorage.getItem('access_token'));

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/feed', {
        params: {
          q: query || undefined,
          sort,
          only_following: onlyFollowing,
          limit: 60,
          skip: 0,
        },
      });
      setPosts(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load feed.');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [onlyFollowing, query, sort]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  const handleCreatePost = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent || creatingPost) return;

    setCreatingPost(true);
    setActionError('');
    try {
      await api.post('/posts/', { title: cleanTitle, content: cleanContent });
      setTitle('');
      setContent('');
      setShowComposer(false);
      await loadFeed();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to create post.');
    } finally {
      setCreatingPost(false);
    }
  };

  const toggleLike = async (post) => {
    setActionError('');
    const nextLiked = !post.is_liked;
    setPosts((prev) => prev.map((row) => (
      row.id === post.id
        ? {
          ...row,
          is_liked: nextLiked,
          like_count: Math.max(0, row.like_count + (nextLiked ? 1 : -1)),
        }
        : row
    )));

    try {
      if (nextLiked) {
        await api.post(`/posts/${post.id}/reactions`, { reaction_type: 'like' });
      } else {
        await api.delete(`/posts/${post.id}/reactions`);
      }
    } catch {
      setPosts((prev) => prev.map((row) => (row.id === post.id ? post : row)));
      setActionError('Failed to update reaction.');
    }
  };

  const toggleBookmark = async (post) => {
    setActionError('');
    const nextBookmarked = !post.is_bookmarked;
    setPosts((prev) => prev.map((row) => (
      row.id === post.id ? { ...row, is_bookmarked: nextBookmarked } : row
    )));
    try {
      if (nextBookmarked) {
        await api.post(`/posts/${post.id}/bookmark`);
      } else {
        await api.delete(`/posts/${post.id}/bookmark`);
      }
    } catch {
      setPosts((prev) => prev.map((row) => (row.id === post.id ? post : row)));
      setActionError('Failed to update bookmark.');
    }
  };

  const toggleFollow = async (post) => {
    if (post.author_id === currentUserId) return;
    setActionError('');
    const nextFollowing = !post.is_following_author;
    setPosts((prev) => prev.map((row) => (
      row.author_id === post.author_id ? { ...row, is_following_author: nextFollowing } : row
    )));
    try {
      if (nextFollowing) {
        await api.post(`/users/${post.author_id}/follow`);
      } else {
        await api.delete(`/users/${post.author_id}/follow`);
      }
    } catch {
      setPosts((prev) => prev.map((row) => (
        row.author_id === post.author_id ? { ...row, is_following_author: post.is_following_author } : row
      )));
      setActionError('Failed to update follow status.');
    }
  };

  const reportPost = async (postId) => {
    const reason = window.prompt('Report reason (min 5 characters):');
    if (!reason) return;
    try {
      await api.post('/reports', { target_type: 'post', target_id: postId, reason });
      window.alert('Report submitted.');
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Failed to submit report.');
    }
  };

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading feed...';
    if (error) return error;
    return 'No posts matched your filters.';
  }, [error, loading]);

  return (
    <section className="page page-feed">
      <div className="page-header">
        <h1>Community Feed</h1>
        <p>Discover stories, react to ideas, and follow authors you care about.</p>
      </div>

      <div className="feed-container">
        <article className="card feed-toolbar">
          <form className="feed-search-row" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search posts by title or content"
            />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>

          <div className="feed-filter-row">
            <label className="feed-select-wrap">
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="latest">Latest</option>
                <option value="most_liked">Most Liked</option>
                <option value="most_commented">Most Commented</option>
              </select>
            </label>

            <label className="feed-toggle-wrap">
              <input
                type="checkbox"
                checked={onlyFollowing}
                onChange={(event) => setOnlyFollowing(event.target.checked)}
              />
              <span>Only people I follow</span>
            </label>

            <button
              type="button"
              className="btn btn-muted"
              onClick={() => {
                setSearchInput('');
                setQuery('');
                setSort('latest');
                setOnlyFollowing(false);
              }}
            >
              Reset
            </button>
          </div>
        </article>

        {isLoggedIn && (
          <div className="feed-actions">
            <button type="button" onClick={() => setShowComposer((prev) => !prev)} className="btn btn-accent">
              {showComposer ? 'Cancel' : '+ Create New Post'}
            </button>
          </div>
        )}

        {showComposer && (
          <article className="card create-post-card">
            <h3>Share your perspective</h3>
            <form onSubmit={handleCreatePost} className="form-stack">
              <input
                type="text"
                placeholder="Post title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <textarea
                placeholder="What are you thinking about today?"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                required
                rows="5"
              />
              <button type="submit" className="btn btn-accent" disabled={creatingPost}>
                {creatingPost ? 'Publishing...' : 'Publish'}
              </button>
            </form>
          </article>
        )}

        {actionError && <div className="form-error">{actionError}</div>}

        {posts.length === 0 ? (
          <p className={`status-text ${error ? 'status-error' : ''}`}>{emptyMessage}</p>
        ) : (
          <div className="feed-list">
            {posts.map((post) => (
              <article key={post.id} className="card post-card">
                <Link to={`/post/${post.id}`} className="post-title-link">
                  <h2>{post.title}</h2>
                </Link>
                <p className="post-snippet">{post.content}</p>
                <div className="post-meta">
                  <span>By {post.author?.username || 'Unknown'}</span>
                  <span>{new Date(post.created_at).toLocaleString()}</span>
                </div>

                <div className="post-engagement-row">
                  <button type="button" className="btn btn-muted" onClick={() => toggleLike(post)}>
                    {post.is_liked ? 'Unlike' : 'Like'} ({post.like_count})
                  </button>
                  <button type="button" className="btn btn-muted" onClick={() => toggleBookmark(post)}>
                    {post.is_bookmarked ? 'Saved' : 'Save'}
                  </button>
                  {post.author_id !== currentUserId && (
                    <button type="button" className="btn btn-muted" onClick={() => toggleFollow(post)}>
                      {post.is_following_author ? 'Following' : 'Follow'}
                    </button>
                  )}
                  <button type="button" className="btn btn-muted" onClick={() => reportPost(post.id)}>
                    Report
                  </button>
                </div>

                <div className="post-submeta">
                  <span>{post.comment_count} comments</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Home;
