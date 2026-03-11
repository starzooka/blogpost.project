import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
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
import api, { clearSessionData, getSessionSnapshot, isAdminUser, setSessionData } from './api';
import { getTheme } from './theme';
import './App.css';

function App() {
  const [auth, setAuth] = useState(getSessionSnapshot);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem('themeMode');
    return saved || 'light';
  });
  const [unreadCount, setUnreadCount] = useState(0);

  const token = auth.accessToken;
  const username = auth.username;
  const avatarUrl = auth.avatarUrl;
  const adminAccess = isAdminUser(auth.userId, auth.username);
  const isMenuOpen = Boolean(menuAnchorEl);

  const displayName = useMemo(() => {
    if (!username) return 'User';
    return username.charAt(0).toUpperCase() + username.slice(1);
  }, [username]);

  useEffect(() => {
    const handleStorage = () => setAuth(getSessionSnapshot());
    const handleSessionUpdate = () => setAuth(getSessionSnapshot());
    window.addEventListener('storage', handleStorage);
    window.addEventListener('session-updated', handleSessionUpdate);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('session-updated', handleSessionUpdate);
    };
  }, []);

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

  useEffect(() => {
    if (!token) return undefined;
    let isMounted = true;

    const syncNavbarAvatar = async () => {
      try {
        const response = await api.get('/me/profile');
        const nextAvatarUrl = response.data?.avatar_url || '';
        setSessionData({ avatarUrl: nextAvatarUrl });
        if (isMounted) {
          setAuth(getSessionSnapshot());
        }
      } catch {
        // Keep the current avatar snapshot if refresh fails.
      }
    };

    syncNavbarAvatar();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleOpenMenu = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await api.post('/logout', { refresh_token: refreshToken }, { skipAuthRefresh: true });
      } catch {
        // Continue with local logout even if token revoke fails.
      }
    }

    clearSessionData();
    handleCloseMenu();
    window.location.href = '/login';
  };

  const unreadLabel = unreadCount > 99 ? '99+' : unreadCount;
  const authPaths = ['/login', '/signup', '/signin', '/register'];

function Topbar({
    token,
    unreadLabel,
    unreadCount,
    handleOpenMenu,
    isMenuOpen,
    avatarUrl,
    displayName,
    handleLogout,
    adminAccess,
    handleCloseMenu,
    themeMode,
    setThemeMode,
  }) {
    const location = useLocation();
    const hide = authPaths.includes(location.pathname);
    const isHomeRoute = location.pathname === '/';
    if (hide) return null;

    return (
      <AppBar position="sticky" color="default" className={`topbar${isHomeRoute ? ' topbar-home' : ''}`}>
        <Container maxWidth="xl">
          <Toolbar disableGutters className="topbar-toolbar">
            <Stack direction="row" alignItems="center" spacing={1.5} className="brand-wrap">
              <Box component="img" src="/inklounge-logo.png" alt="InkLounge logo" className="brand-logo" />
              <Box>
                <Typography component={Link} to="/" variant="h6" className="brand-link">
                  InkLounge
                </Typography>
                <Typography variant="caption" className="brand-subtitle">
                  Thoughtful stories, strong conversations.
                </Typography>
              </Box>
            </Stack>

            {token && (
              <Stack direction="row" spacing={1} className="nav-links">
                <Button component={Link} to="/" startIcon={<HomeRoundedIcon fontSize="small" />}>
                  Feed
                </Button>
                <Button component={Link} to="/chat" startIcon={<ForumRoundedIcon fontSize="small" />}>
                  Messages
                </Button>
                <Button
                  component={Link}
                  to="/notifications"
                  startIcon={(
                    <Badge
                      color="secondary"
                      badgeContent={unreadLabel}
                      invisible={unreadCount === 0}
                      max={99}
                    >
                      <NotificationsRoundedIcon fontSize="small" />
                    </Badge>
                  )}
                >
                  Alerts
                </Button>
              </Stack>
            )}

            <Stack direction="row" alignItems="center" spacing={1} className="session-box">
              <IconButton
                onClick={() => {
                  const newMode = themeMode === 'dark' ? 'light' : 'dark';
                  setThemeMode(newMode);
                  localStorage.setItem('themeMode', newMode);
                }}
                color="inherit"
                size="small"
              >
                {themeMode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>

              {token ? (
                <>
                  <Button
                    type="button"
                    className="user-menu-trigger"
                    onClick={handleOpenMenu}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    startIcon={(
                      <Avatar src={avatarUrl || undefined} sx={{ width: 28, height: 28 }}>
                        {displayName.charAt(0)}
                      </Avatar>
                    )}
                    endIcon={<KeyboardArrowDownRoundedIcon />}
                  >
                    {displayName}
                  </Button>

                  <Menu
                    anchorEl={menuAnchorEl}
                    open={isMenuOpen}
                    onClose={handleCloseMenu}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    className="user-dropdown-menu"
                  >
                    <MenuItem component={Link} to="/profile" onClick={handleCloseMenu}>
                      <PersonOutlineRoundedIcon fontSize="small" />
                      <span>My Profile</span>
                    </MenuItem>
                    <MenuItem component={Link} to="/settings" onClick={handleCloseMenu}>
                      <SettingsRoundedIcon fontSize="small" />
                      <span>Settings</span>
                    </MenuItem>
                    <MenuItem component={Link} to="/saved" onClick={handleCloseMenu}>
                      <BookmarkRoundedIcon fontSize="small" />
                      <span>Saved Posts</span>
                    </MenuItem>
                    <MenuItem component={Link} to="/notifications" onClick={handleCloseMenu}>
                      <NotificationsRoundedIcon fontSize="small" />
                      <span>Notifications{unreadCount > 0 ? ` (${unreadLabel})` : ''}</span>
                    </MenuItem>
                    <MenuItem component={Link} to="/help" onClick={handleCloseMenu}>
                      <HelpRoundedIcon fontSize="small" />
                      <span>Help Center</span>
                    </MenuItem>
                    {adminAccess && (
                      <MenuItem component={Link} to="/moderation" onClick={handleCloseMenu}>
                        <AdminPanelSettingsRoundedIcon fontSize="small" />
                        <span>Moderation</span>
                      </MenuItem>
                    )}
                    <Divider />
                    <MenuItem onClick={handleLogout}>
                      <LogoutRoundedIcon fontSize="small" />
                      <span>Logout</span>
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <Button component={Link} to="/login" variant="contained" color="primary">
                  Login
                </Button>
              )}
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>
    );
  }

  function AppContent() {
    const location = useLocation();
    const isAuthRoute = authPaths.includes(location.pathname);
    const isHomeRoute = location.pathname === '/';
    const routes = (
      <Routes>
        <Route path="/" element={token ? <Home /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signin" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={token ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/register" element={token ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/post/:id" element={token ? <Post /> : <Navigate to="/login" replace />} />
        <Route path="/chat" element={token ? <Chat /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={token ? <Profile /> : <Navigate to="/login" replace />} />
        <Route path="/settings" element={token ? <Settings /> : <Navigate to="/login" replace />} />
        <Route path="/saved" element={token ? <SavedPosts /> : <Navigate to="/login" replace />} />
        <Route path="/notifications" element={token ? <Notifications /> : <Navigate to="/login" replace />} />
        <Route path="/help" element={token ? <HelpCenter /> : <Navigate to="/login" replace />} />
        <Route
          path="/moderation"
          element={token ? (adminAccess ? <Moderation /> : <Navigate to="/" replace />) : <Navigate to="/login" replace />}
        />
      </Routes>
    );

    return (
      <main className={`app-main${isAuthRoute ? ' app-main-auth' : ''}${isHomeRoute ? ' app-main-home' : ''}`}>
        {isAuthRoute || isHomeRoute ? routes : <GradientBackground>{routes}</GradientBackground>}
      </main>
    );
  }

  // application UI after helper components
  return (
    <ThemeProvider theme={getTheme(themeMode)}>
      <Router>
        <div className="app-shell">
          <Topbar
            token={token}
            unreadLabel={unreadLabel}
            unreadCount={unreadCount}
            handleOpenMenu={handleOpenMenu}
            isMenuOpen={isMenuOpen}
            avatarUrl={avatarUrl}
            displayName={displayName}
            handleLogout={handleLogout}
            adminAccess={adminAccess}
            handleCloseMenu={handleCloseMenu}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
          />

          <AppContent />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
