import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import ImageLightbox from '../components/ImageLightbox';

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState('');

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

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadingImage(true);
    setActionError('');
    try {
      const response = await api.post('/upload-image/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(response.data.image_url);
    } catch {
      setActionError('Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  const handleCreatePost = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (uploadingImage) {
      setActionError('Please wait for image upload to finish.');
      return;
    }
    if (!cleanTitle || !cleanContent || creatingPost) return;

    setCreatingPost(true);
    setActionError('');
    try {
      await api.post('/posts/', { title: cleanTitle, content: cleanContent, image_url: imageUrl });
      setTitle('');
      setContent('');
      setImageUrl('');
      setShowComposer(false);
      await loadFeed();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to create post.');
    } finally {
      setCreatingPost(false);
    }
  };

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading feed...';
    if (error) return error;
    return 'No posts matched your filters.';
  }, [error, loading]);

  const featuredSlots = useMemo(() => {
    const rows = posts.slice(0, 6);
    while (rows.length < 6) rows.push(null);
    return rows;
  }, [posts]);

  const latestPosts = useMemo(() => posts.slice(6), [posts]);

  const getPostTag = (post) => {
    if (post.like_count >= 10) return 'Engineering';
    if (post.comment_count >= 5) return 'Design';
    if (post.is_bookmarked) return 'Product';
    return 'Company';
  };

  const formatDate = (value) => {
    try {
      return new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const authorInitial = (username) => {
    if (!username) return 'U';
    return username.charAt(0).toUpperCase();
  };

  const renderAuthor = (post) => (
    <div className="home-blog-author-row">
      <div className="home-blog-author-left">
        {post.author?.avatar_url ? (
          <img src={post.author.avatar_url} alt={post.author?.username || 'Author'} className="home-blog-avatar" />
        ) : (
          <span className="home-blog-avatar home-blog-avatar-fallback">{authorInitial(post.author?.username)}</span>
        )}
        <span className="home-blog-author-name">{post.author?.username || 'Unknown'}</span>
      </div>
      <span className="home-blog-date">{formatDate(post.created_at)}</span>
    </div>
  );

  const renderFeatureCard = (post, variant) => {
    if (!post) {
      return <div className={`home-blog-card home-blog-card-empty ${variant}`} key={`${variant}-empty`} />;
    }

    const textOnly = variant === 'stacked';
    return (
      <article key={post.id} className={`home-blog-card ${variant}`}>
        {!textOnly && post.image_url && (
          <button
            type="button"
            className="home-blog-image-button"
            onClick={() => setFullscreenImage(post.image_url)}
            aria-label="Open image in full screen"
          >
            <img src={post.image_url} alt={post.title} className="home-blog-image" />
          </button>
        )}
        <div className="home-blog-card-content">
          <span className="home-blog-tag">{getPostTag(post)}</span>
          <Link to={`/post/${post.id}`} className="home-blog-title-link">
            <h3>{post.title}</h3>
          </Link>
          <p className="home-blog-snippet">{post.content}</p>
          {renderAuthor(post)}
        </div>
      </article>
    );
  };

  return (
    <section className="home-blog-shell">
      <header className="home-blog-hero">
        <div>
          <h1>Blog</h1>
          <p>Stay in the loop with the latest stories from your community.</p>
        </div>
        {isLoggedIn && (
          <button type="button" onClick={() => setShowComposer((prev) => !prev)} className="btn home-blog-create-btn">
            {showComposer ? 'Close editor' : '+ Create New Post'}
          </button>
        )}
      </header>

      <article className="home-blog-toolbar">
        <div className="home-blog-chip-row">
          <button
            type="button"
            className={`home-blog-chip${sort === 'latest' ? ' is-active' : ''}`}
            onClick={() => setSort('latest')}
          >
            All categories
          </button>
          <button
            type="button"
            className={`home-blog-chip${sort === 'most_liked' ? ' is-active' : ''}`}
            onClick={() => setSort('most_liked')}
          >
            Product
          </button>
          <button
            type="button"
            className={`home-blog-chip${sort === 'most_commented' ? ' is-active' : ''}`}
            onClick={() => setSort('most_commented')}
          >
            Design
          </button>
          <button
            type="button"
            className={`home-blog-chip${onlyFollowing ? ' is-active' : ''}`}
            onClick={() => setOnlyFollowing((prev) => !prev)}
          >
            Following
          </button>
        </div>

        <form className="home-blog-search-row" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search..."
          />
          <button type="submit" className="btn home-blog-btn-main">Search</button>
          <button
            type="button"
            className="btn home-blog-btn-subtle"
            onClick={() => {
              setSearchInput('');
              setQuery('');
              setSort('latest');
              setOnlyFollowing(false);
            }}
          >
            Reset
          </button>
        </form>
      </article>

      {showComposer && (
        <article className="home-blog-composer">
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
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
            {imageUrl && <p className="home-blog-upload-note">Image uploaded and ready to publish.</p>}
            <button type="submit" className="btn home-blog-btn-main" disabled={creatingPost || uploadingImage}>
              {creatingPost ? 'Publishing...' : uploadingImage ? 'Uploading image...' : 'Publish'}
            </button>
          </form>
        </article>
      )}

      {actionError && <div className="form-error">{actionError}</div>}

      {posts.length === 0 ? (
        <p className={`status-text ${error ? 'status-error' : ''}`}>{emptyMessage}</p>
      ) : (
        <>
          <section className="home-blog-section">
            <div className="home-blog-feature-grid">
              {renderFeatureCard(featuredSlots[0], 'hero')}
              {renderFeatureCard(featuredSlots[1], 'hero')}
              {renderFeatureCard(featuredSlots[2], 'column')}
              <div className="home-blog-stack-col">
                {renderFeatureCard(featuredSlots[3], 'stacked')}
                {renderFeatureCard(featuredSlots[4], 'stacked')}
              </div>
              {renderFeatureCard(featuredSlots[5], 'column')}
            </div>
          </section>

          {latestPosts.length > 0 && (
            <section className="home-blog-section">
              <div className="home-blog-latest-head">
                <h2>Latest</h2>
              </div>
              <div className="home-blog-latest-grid">
                {latestPosts.map((post) => (
                  <article key={post.id} className="home-blog-latest-item">
                    <span className="home-blog-tag">{getPostTag(post)}</span>
                    <Link to={`/post/${post.id}`} className="home-blog-latest-title-link">
                      <h3>{post.title}</h3>
                    </Link>
                    <p>{post.content}</p>
                    {renderAuthor(post)}
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ImageLightbox imageUrl={fullscreenImage} onClose={() => setFullscreenImage('')} />
    </section>
  );
}

export default Home;
