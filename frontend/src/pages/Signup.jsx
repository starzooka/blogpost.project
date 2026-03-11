import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
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
import api from '../api';

const highlights = [
  {
    Icon: AutoStoriesRoundedIcon,
    title: 'Write with clarity',
    description: 'Create compelling long-form posts in a focused and distraction-free editor.',
  },
  {
    Icon: ForumRoundedIcon,
    title: 'Build real conversations',
    description: 'Turn readers into a community through comments, reactions, and direct chat.',
  },
  {
    Icon: GroupsRoundedIcon,
    title: 'Find your people',
    description: 'Follow creators in your niche and connect with readers who care about your topics.',
  },
  {
    Icon: RocketLaunchRoundedIcon,
    title: 'Grow consistently',
    description: 'Use insights and engagement signals to sharpen your voice and expand your reach.',
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

const SignUpCard = styled(MuiCard)(({ theme }) => ({
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

function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      await api.post('/users/', { username, email, password });
      window.alert('Account created successfully! Please log in.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'Signup failed. Try a different username or email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
            Start publishing in minutes and build your writer identity.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'rgba(222, 236, 255, 0.84)',
              maxWidth: 560,
              mb: 3.2,
            }}
          >
            Join InkLounge to share stories, connect with engaged readers, and grow your presence with every post.
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

        <SignUpCard variant="outlined">
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
            Create account
          </Typography>
          <Typography sx={{ textAlign: 'left', color: '#e2eeff', mb: 2 }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" variant="body2" sx={{ color: '#ffffff', fontWeight: 700 }}>
              Sign in
            </Link>
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
            <FormControl>
              <FormLabel htmlFor="username" sx={{ color: 'rgba(224, 237, 255, 0.92)', mb: 0.7 }}>
                Username
              </FormLabel>
              <TextField
                autoComplete="username"
                name="username"
                required
                fullWidth
                id="username"
                placeholder="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                sx={fieldSx}
              />
            </FormControl>

            <FormControl>
              <FormLabel htmlFor="email" sx={{ color: 'rgba(224, 237, 255, 0.92)', mb: 0.7 }}>
                Email
              </FormLabel>
              <TextField
                required
                fullWidth
                id="email"
                name="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                sx={fieldSx}
              />
            </FormControl>

            <FormControl>
              <FormLabel htmlFor="password" sx={{ color: 'rgba(224, 237, 255, 0.92)', mb: 0.7 }}>
                Password
              </FormLabel>
              <TextField
                required
                fullWidth
                name="password"
                placeholder="********"
                type="password"
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                sx={fieldSx}
              />
            </FormControl>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={isSubmitting}
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
                '&.Mui-disabled': {
                  background: 'rgba(237, 244, 255, 0.72)',
                  color: 'rgba(15, 29, 54, 0.72)',
                },
              }}
            >
              {isSubmitting ? 'Creating account...' : 'Sign up'}
            </Button>
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
              Sign up with Google
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
              Sign up with Facebook
            </Button>
          </Stack>
        </SignUpCard>
      </AuthGrid>
    </AuthShell>
  );
}

export default Signup;
