import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MuiCard from '@mui/material/Card';
import { styled } from '@mui/material/styles';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import GoogleIcon from '@mui/icons-material/Google';
import FacebookIcon from '@mui/icons-material/Facebook';
import api, { setSessionData } from '../api';

const highlights = [
  {
    Icon: AutoStoriesRoundedIcon,
    title: 'Publish with confidence',
    description: 'Create polished blog posts in minutes with a clean writing experience.',
  },
  {
    Icon: ForumRoundedIcon,
    title: 'Meaningful conversations',
    description: 'Connect through thoughtful comments, discussions, and private chat.',
  },
  {
    Icon: GroupsRoundedIcon,
    title: 'A strong creator community',
    description: 'Follow writers you love and build your own loyal readership.',
  },
  {
    Icon: RocketLaunchRoundedIcon,
    title: 'Grow every week',
    description: 'Track engagement and improve your content with clear feedback loops.',
  },
];

const AuthShell = styled('section')(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(2),
  background: '#0b2c58',
  position: 'relative',
  overflow: 'hidden',
}));

const AuthGrid = styled(Box)(({ theme }) => ({
  width: 'min(1120px, 100%)',
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 1fr) minmax(340px, 470px)',
  gap: theme.spacing(5),
  alignItems: 'center',
  position: 'relative',
  zIndex: 1,
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
    maxWidth: 560,
    gap: theme.spacing(3),
  },
}));

const BrandPanel = styled(Box)(({ theme }) => ({
  color: '#d9e8ff',
  paddingRight: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    paddingRight: 0,
  },
}));

const HighlightRow = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '26px 1fr',
  gap: theme.spacing(1.5),
  alignItems: 'start',
}));

const SignInCard = styled(MuiCard)(({ theme }) => ({
  width: '100%',
  borderRadius: 20,
  border: '1px solid rgba(109, 145, 192, 0.35)',
  background: 'rgba(3, 16, 37, 0.82)',
  boxShadow: '0 24px 56px rgba(1, 8, 20, 0.58)',
  backdropFilter: 'blur(6px)',
  padding: theme.spacing(4),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(3),
  },
}));

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    color: '#f6fbff',
    backgroundColor: 'rgba(2, 11, 27, 0.64)',
    '& fieldset': {
      borderColor: 'rgba(111, 147, 194, 0.4)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(140, 181, 234, 0.72)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#5aa8ff',
      boxShadow: '0 0 0 3px rgba(90, 168, 255, 0.2)',
    },
  },
  '& .MuiFormHelperText-root': {
    marginLeft: 0,
  },
};

function Login() {
  const [username, setUsername] = useState(() => localStorage.getItem('remembered_username') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('remembered_username')));
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [usernameErrorMessage, setUsernameErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetStage, setResetStage] = useState('request');
  const [resetError, setResetError] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const validateInputs = () => {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    let isValid = true;

    if (!cleanUsername) {
      setUsernameError(true);
      setUsernameErrorMessage('Please enter your username or email.');
      isValid = false;
    } else {
      setUsernameError(false);
      setUsernameErrorMessage('');
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      setPasswordError(true);
      setPasswordErrorMessage('Password must be at least 6 characters long.');
      isValid = false;
    } else {
      setPasswordError(false);
      setPasswordErrorMessage('');
    }

    return isValid;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!validateInputs()) {
      return;
    }

    const formData = new URLSearchParams();
    formData.append('username', username.trim());
    formData.append('password', password);

    try {
      const response = await api.post('/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        skipAuthRefresh: true,
      });

      setSessionData({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        username: response.data.username,
        userId: response.data.user_id,
      });

      if (rememberMe) {
        localStorage.setItem('remembered_username', username.trim());
      } else {
        localStorage.removeItem('remembered_username');
      }
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    }
  };

  const openResetDialog = () => {
    setResetOpen(true);
    setResetError('');
    setResetStatus('');
  };

  const closeResetDialog = () => {
    setResetOpen(false);
  };

  const resetDialogToRequest = () => {
    setResetStage('request');
    setResetOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
    setResetError('');
    setResetStatus('');
  };

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    const email = resetEmail.trim().toLowerCase();
    if (!email || requestingOtp) return;

    setRequestingOtp(true);
    setResetError('');
    setResetStatus('');
    try {
      const response = await api.post('/password-reset/request', { email }, { skipAuthRefresh: true });
      setResetEmail(email);
      setResetStage('confirm');
      setResetStatus(response.data?.message || 'If this email is registered, an OTP has been sent.');
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to send OTP. Please try again.');
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (resettingPassword) return;

    if (newPassword !== confirmNewPassword) {
      setResetError('New password and confirm password must match.');
      return;
    }

    setResettingPassword(true);
    setResetError('');
    setResetStatus('');
    try {
      const response = await api.post(
        '/password-reset/confirm',
        {
          email: resetEmail.trim().toLowerCase(),
          otp: resetOtp.trim(),
          new_password: newPassword,
        },
        { skipAuthRefresh: true }
      );
      setResetStatus(response.data?.message || 'Password reset successful. Please log in.');
      setUsername(resetEmail.trim().toLowerCase());
      setPassword('');
      closeResetDialog();
      resetDialogToRequest();
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <>
      <AuthShell>
        <AuthGrid>
          <BrandPanel>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2.5 }}>
              <Box component="img" src="/inklounge-logo.png" alt="InkLounge logo" sx={{ width: 34, height: 34 }} />
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  color: '#9bc6ff',
                }}
              >
                InkLounge
              </Typography>
            </Stack>

            <Typography
              component="h2"
              variant="h3"
              sx={{
                fontWeight: 700,
                lineHeight: 1.15,
                color: '#f5f9ff',
                mb: 1.5,
                fontSize: { xs: '2rem', md: '2.45rem' },
                maxWidth: 560,
              }}
            >
              Share ideas. Build your voice. Grow your audience.
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: 'rgba(222, 236, 255, 0.84)',
                maxWidth: 560,
                mb: 3.2,
              }}
            >
              InkLounge helps writers and readers discover thoughtful stories and start meaningful conversations.
            </Typography>

            <Stack spacing={2.4}>
              {highlights.map((highlight) => (
                <HighlightRow key={highlight.title}>
                  <highlight.Icon sx={{ fontSize: 20, mt: 0.4, color: '#84bcff' }} />
                  <Box>
                    <Typography sx={{ fontWeight: 700, color: '#ffffff' }}>{highlight.title}</Typography>
                    <Typography sx={{ color: 'rgba(205, 226, 255, 0.84)', mt: 0.3 }}>
                      {highlight.description}
                    </Typography>
                  </Box>
                </HighlightRow>
              ))}
            </Stack>
          </BrandPanel>

          <SignInCard variant="outlined">
            <Typography
              component="h1"
              variant="h3"
              sx={{
                color: '#f8fbff',
                fontSize: 'clamp(1.95rem, 6vw, 2.35rem)',
                fontWeight: 700,
                mb: 0.5,
              }}
            >
              Sign in
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
              <FormControl>
                <FormLabel htmlFor="username" sx={{ color: 'rgba(224, 237, 255, 0.92)', mb: 0.7 }}>
                  Email or Username
                </FormLabel>
                <TextField
                  error={usernameError}
                  helperText={usernameErrorMessage}
                  id="username"
                  type="text"
                  name="username"
                  placeholder="your@email.com"
                  autoComplete="username"
                  autoFocus
                  required
                  fullWidth
                  variant="outlined"
                  color={usernameError ? 'error' : 'primary'}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  sx={fieldSx}
                />
              </FormControl>

              <FormControl>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.7 }}>
                  <FormLabel htmlFor="password" sx={{ color: 'rgba(224, 237, 255, 0.92)' }}>
                    Password
                  </FormLabel>
                  <Link
                    component="button"
                    type="button"
                    onClick={openResetDialog}
                    variant="body2"
                    sx={{ color: '#f7fbff', fontWeight: 600 }}
                  >
                    Forgot your password?
                  </Link>
                </Stack>
                <TextField
                  error={passwordError}
                  helperText={passwordErrorMessage}
                  name="password"
                  placeholder="********"
                  type="password"
                  id="password"
                  autoComplete="current-password"
                  required
                  fullWidth
                  variant="outlined"
                  color={passwordError ? 'error' : 'primary'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  sx={fieldSx}
                />
              </FormControl>

              <FormControlLabel
                control={(
                  <Checkbox
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    sx={{
                      color: 'rgba(196, 221, 255, 0.88)',
                      '&.Mui-checked': {
                        color: '#8ec4ff',
                      },
                    }}
                  />
                )}
                label="Remember me"
                sx={{ color: '#e1efff', mt: -0.3 }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  py: 1.25,
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: 'none',
                  fontSize: '1rem',
                  background: 'linear-gradient(90deg, #f7fbff 0%, #e5edf8 100%)',
                  color: '#0f1d36',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #ffffff 0%, #eaf2ff 100%)',
                  },
                }}
              >
                Sign in
              </Button>

              <Typography sx={{ textAlign: 'center', color: '#e2eeff' }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/signup" variant="body2" sx={{ color: '#ffffff', fontWeight: 700 }}>
                  Sign up
                </Link>
              </Typography>
            </Box>

            <Divider
              sx={{
                color: 'rgba(228, 239, 255, 0.92)',
                my: 2.3,
                '&::before, &::after': {
                  borderColor: 'rgba(113, 149, 194, 0.36)',
                },
              }}
            >
              or
            </Divider>

            <Stack spacing={1.4}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<GoogleIcon />}
                disabled
                sx={{
                  color: '#e8f1ff',
                  borderColor: 'rgba(117, 151, 195, 0.55)',
                  py: 1.1,
                  borderRadius: 2,
                  textTransform: 'none',
                  '&.Mui-disabled': {
                    color: 'rgba(232, 241, 255, 0.82)',
                    borderColor: 'rgba(117, 151, 195, 0.4)',
                  },
                }}
              >
                Sign in with Google
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<FacebookIcon />}
                disabled
                sx={{
                  color: '#e8f1ff',
                  borderColor: 'rgba(117, 151, 195, 0.55)',
                  py: 1.1,
                  borderRadius: 2,
                  textTransform: 'none',
                  '&.Mui-disabled': {
                    color: 'rgba(232, 241, 255, 0.82)',
                    borderColor: 'rgba(117, 151, 195, 0.4)',
                  },
                }}
              >
                Sign in with Facebook
              </Button>
            </Stack>
          </SignInCard>
        </AuthGrid>
      </AuthShell>

      <Dialog open={resetOpen} onClose={closeResetDialog} fullWidth maxWidth="xs">
        <DialogTitle>Reset your password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Enter your email to receive an OTP, then use it to set a new password.
            </Typography>
            {resetStatus && <Alert severity="success">{resetStatus}</Alert>}
            {resetError && <Alert severity="error">{resetError}</Alert>}

            {resetStage === 'request' ? (
              <Box component="form" onSubmit={handleRequestOtp} sx={{ display: 'grid', gap: 1.5 }}>
                <TextField
                  label="Email"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  fullWidth
                />
                <DialogActions sx={{ px: 0, pb: 0, justifyContent: 'space-between' }}>
                  <Button type="button" onClick={closeResetDialog}>Cancel</Button>
                  <Button type="submit" variant="contained" disabled={requestingOtp}>
                    {requestingOtp ? 'Sending OTP...' : 'Send OTP'}
                  </Button>
                </DialogActions>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleResetPassword} sx={{ display: 'grid', gap: 1.5 }}>
                <TextField
                  label="Email"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  fullWidth
                />
                <TextField
                  label="OTP"
                  value={resetOtp}
                  onChange={(event) => setResetOtp(event.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  placeholder="Enter OTP"
                  required
                  fullWidth
                />
                <TextField
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="********"
                  required
                  fullWidth
                />
                <TextField
                  label="Confirm New Password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  placeholder="********"
                  required
                  fullWidth
                />

                <DialogActions sx={{ px: 0, pb: 0, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Button type="button" onClick={resetDialogToRequest}>Request new OTP</Button>
                  <Stack direction="row" spacing={1}>
                    <Button type="button" onClick={closeResetDialog}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={resettingPassword}>
                      {resettingPassword ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </Stack>
                </DialogActions>
              </Box>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default Login;
