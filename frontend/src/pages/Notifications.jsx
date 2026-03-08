import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function notificationLink(item, commentPostMap) {
  if (item.entity_type === 'post' && item.entity_id) {
    return `/post/${item.entity_id}`;
  }

  if (item.entity_type === 'comment' && item.entity_id) {
    const postId = commentPostMap[item.entity_id];
    if (postId) {
      return `/post/${postId}`;
    }
    return '/';
  }

  if (item.entity_type === 'message') {
    if (item.actor_id) {
      return `/chat?user=${item.actor_id}`;
    }
    return '/chat';
  }

  if (item.entity_type === 'user') {
    return '/profile';
  }

  return '/notifications';
}

function Notifications() {
  const [items, setItems] = useState([]);
  const [commentPostMap, setCommentPostMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const unreadCount = useMemo(
    () => items.reduce((count, item) => (item.is_read ? count : count + 1), 0),
    [items]
  );

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await api.get('/notifications', { params: { limit: 50 } });
        setItems(response.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load notifications.');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  useEffect(() => {
    const resolveCommentTargets = async () => {
      const commentIds = [...new Set(
        items
          .filter((item) => item.entity_type === 'comment' && item.entity_id)
          .map((item) => item.entity_id)
      )];

      if (commentIds.length === 0) {
        setCommentPostMap({});
        return;
      }

      try {
        const responses = await Promise.all(
          commentIds.map((commentId) => api.get(`/comments/${commentId}/post`))
        );

        const nextMap = {};
        commentIds.forEach((commentId, index) => {
          const postId = Number(responses[index].data?.post_id || 0);
          if (postId > 0) {
            nextMap[commentId] = postId;
          }
        });
        setCommentPostMap(nextMap);
      } catch {
        setCommentPostMap({});
      }
    };

    resolveCommentTargets();
  }, [items]);

  const markOneRead = async (notificationId) => {
    try {
      const response = await api.post(`/notifications/${notificationId}/read`);
      setItems((prev) => prev.map((item) => (item.id === notificationId ? response.data : item)));
    } catch {
      // Keep UI stable if request fails.
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to mark all as read.');
    }
  };

  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>Notifications</h1>
        <p>Recent activity related to your posts, follows, and messages.</p>
      </header>

      <article className="card account-main">
        <div className="notification-head-row">
          <h2>Inbox</h2>
          <div className="inline-actions">
            <span className="status-text">{unreadCount} unread</span>
            <button type="button" className="btn btn-muted" onClick={markAllRead} disabled={unreadCount === 0}>
              Mark all read
            </button>
          </div>
        </div>

        {loading ? (
          <div className="status-text">Loading notifications...</div>
        ) : error ? (
          <div className="status-text status-error">{error}</div>
        ) : items.length === 0 ? (
          <div className="status-text">No notifications yet.</div>
        ) : (
          <div className="notification-list">
            {items.map((item) => (
              <article key={item.id} className={`notification-item ${item.is_read ? '' : 'notification-unread'}`}>
                <Link to={notificationLink(item, commentPostMap)} onClick={() => markOneRead(item.id)}>
                  <strong>{item.message}</strong>
                  <p>Type: {item.type}</p>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </Link>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default Notifications;
