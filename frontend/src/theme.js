import { createTheme } from '@mui/material/styles';

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1565c0',
      light: '#5e92f3',
      dark: '#0d47a1',
    },
    secondary: {
      main: '#00897b',
      light: '#4ebaaa',
      dark: '#00695c',
    },
    background: {
      default: '#ecf2fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#10243e',
      secondary: '#5d6f87',
    },
    divider: 'rgba(16, 36, 62, 0.12)',
    warning: {
      main: '#f9a825',
    },
    error: {
      main: '#c62828',
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: ['"Manrope"', '"Segoe UI"', 'sans-serif'].join(','),
    h1: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
    },
    button: {
      textTransform: 'none',
      letterSpacing: '0.01em',
      fontWeight: 700,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#ecf2fa',
          color: '#10243e',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(16, 36, 62, 0.1)',
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(16, 36, 62, 0.08)',
          boxShadow: '0 18px 42px rgba(15, 34, 58, 0.08)',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 16,
        },
      },
    },
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#5e92f3',
      light: '#90caf9',
      dark: '#1565c0',
    },
    secondary: {
      main: '#4ebaaa',
      light: '#81c784',
      dark: '#00897b',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
    },
    divider: 'rgba(241, 245, 249, 0.12)',
    warning: {
      main: '#ffb74d',
    },
    error: {
      main: '#f44336',
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: ['"Manrope"', '"Segoe UI"', 'sans-serif'].join(','),
    h1: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontWeight: 700,
    },
    button: {
      textTransform: 'none',
      letterSpacing: '0.01em',
      fontWeight: 700,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#0f172a',
          color: '#f1f5f9',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(241, 245, 249, 0.1)',
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(241, 245, 249, 0.08)',
          boxShadow: '0 18px 42px rgba(15, 23, 42, 0.3)',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 16,
        },
      },
    },
  },
});

export const getTheme = (mode) => mode === 'dark' ? darkTheme : lightTheme;
