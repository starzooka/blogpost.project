import { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Post from './pages/Post';
import Signup from './pages/Signup';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import SavedPosts from './pages/SavedPosts';
import Notifications from './pages/Notifications';
import HelpCenter from './pages/HelpCenter';
import Moderation from './pages/Moderation';
import GradientBackground from './components/GradientBackground';
import api, { clearSessionData, getSessionSnapshot, isAdminUser } from './api';
import './App.css';

function App() {
  const [auth, setAuth] = useState(getSessionSnapshot);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef(null);
  const token = auth.accessToken;
  const username = auth.username;
  const adminAccess = isAdminUser(auth.userId, auth.username);

  useEffect(() => {
    const handleStorage = () => setAuth(getSessionSnapshot());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return undefined;
    }

    let isMounted = true;
    const pullUnreadCount = async () => {
      try {
        const response = await api.get('/notifications/unread-count');
        if (isMounted) {
          setUnreadCount(Number(response.data?.unread_count || 0));
        }
      } catch {
        if (isMounted) {
          setUnreadCount(0);
        }
      }
    };

    pullUnreadCount();
    const intervalId = setInterval(pullUnreadCount, 15000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [token]);

  // Function to handle logging out
  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await api.post('/logout', { refresh_token: refreshToken }, { skipAuthRefresh: true });
      } catch {
        // Ignore revoke errors and continue local logout.
      }
    }

    clearSessionData();
    setIsMenuOpen(false);
    window.location.href = '/login'; // Redirect to login and reload
  };

  return (
    <Router>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand-main">
              <img src="/inklounge-logo.png" alt="InkLounge logo" className="brand-logo" />
              <Link to="/" className="brand-link">InkLounge</Link>
            </div>
            <span className="brand-subtitle">Thoughtful stories, strong conversations.</span>
          </div>

          <nav className="nav-links">
            {token && <Link to="/">Feed</Link>}
            {token && <Link to="/chat">Messages</Link>}
            {token && (
              <Link to="/notifications" className="nav-notification-link">
                Alerts
                {unreadCount > 0 && <span className="badge-pill">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </Link>
            )}
          </nav>

          {token ? (
            <div className="session-box" ref={menuRef}>
              <button
                type="button"
                className="user-pill user-menu-trigger"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
              >
                {username ? username.charAt(0).toUpperCase() + username.slice(1) : 'User'}
                <span className={`menu-caret ${isMenuOpen ? 'open' : ''}`}>v</span>
              </button>

              {isMenuOpen && (
                <div className="user-dropdown" role="menu">
                  <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="dropdown-link">My Profile</Link>
                  <Link to="/settings" onClick={() => setIsMenuOpen(false)} className="dropdown-link">Settings</Link>
                  <Link to="/saved" onClick={() => setIsMenuOpen(false)} className="dropdown-link">Saved Posts</Link>
                  <Link to="/notifications" onClick={() => setIsMenuOpen(false)} className="dropdown-link">
                    Notifications {unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount})` : ''}
                  </Link>
                  <Link to="/help" onClick={() => setIsMenuOpen(false)} className="dropdown-link">Help Center</Link>
                  {adminAccess && <Link to="/moderation" onClick={() => setIsMenuOpen(false)} className="dropdown-link">Moderation</Link>}
                  <div className="dropdown-divider" />
                  <button type="button" onClick={handleLogout} className="dropdown-link dropdown-action">Logout</button>
                </div>
              )}
            </div>
          ) : (
            <div className="session-box" />
          )}
        </header>

        <main className="app-main">
          <GradientBackground>
            <Routes>
              <Route path="/" element={token ? <Home /> : <Navigate to="/login" replace />} />
              <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
              <Route path="/signup" element={token ? <Navigate to="/" replace /> : <Signup />} />
              <Route path="/post/:id" element={token ? <Post /> : <Navigate to="/login" replace />} />
              <Route path="/chat" element={token ? <Chat /> : <Navigate to="/login" replace />} />
              <Route path="/profile" element={token ? <Profile /> : <Navigate to="/login" replace />} />
              <Route path="/settings" element={token ? <Settings /> : <Navigate to="/login" replace />} />
              <Route path="/saved" element={token ? <SavedPosts /> : <Navigate to="/login" replace />} />
              <Route path="/notifications" element={token ? <Notifications /> : <Navigate to="/login" replace />} />
              <Route path="/help" element={token ? <HelpCenter /> : <Navigate to="/login" replace />} />
              <Route path="/moderation" element={token ? (adminAccess ? <Moderation /> : <Navigate to="/" replace />) : <Navigate to="/login" replace />} />
            </Routes>
          </GradientBackground>
        </main>
      </div>
    </Router>
  );
}

export default App;
