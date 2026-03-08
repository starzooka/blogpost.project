import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { setSessionData } from '../api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const formData = new URLSearchParams();
    formData.append('username', username);
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

      window.location.href = '/';
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <section style={styles.wrapper}>
      <div style={styles.card}>
        <h2 style={styles.title}>Welcome back</h2>
        <p style={styles.subtitle}>Log in to continue writing, commenting, and connecting.</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username or Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={styles.input}
              placeholder="Enter your username"
              onFocus={(e) => {
                e.target.style.borderColor = '#ff4f8a';
                e.target.style.boxShadow = '0 0 0 4px rgba(255, 79, 138, 0.18)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#f8bfd2';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="********"
              onFocus={(e) => {
                e.target.style.borderColor = '#ff4f8a';
                e.target.style.boxShadow = '0 0 0 4px rgba(255, 79, 138, 0.18)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#f8bfd2';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-accent btn-login-hero"
            style={styles.button}
          >
            Login
          </button>
        </form>

        <p style={styles.footerText}>
          Don&apos;t have an account?
          <Link to="/signup" style={styles.link}>Sign up</Link>
        </p>
      </div>
    </section>
  );
}

const styles = {
  wrapper: {
    minHeight: 'calc(100vh - 150px)',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: '460px',
    padding: '40px 34px',
    borderRadius: '24px',
    boxShadow: '0 18px 30px rgba(255, 91, 145, 0.22)',
    boxSizing: 'border-box',
    border: '2px solid #ffb8d3',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '34px',
    fontWeight: '800',
    color: '#12203a',
    textAlign: 'center',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    margin: '0 0 30px 0',
    fontSize: '15px',
    color: '#5f4b58',
    lineHeight: '1.6',
    textAlign: 'center',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#ffe2e7',
    color: '#b1153d',
    padding: '11px 14px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '20px',
    border: '1px solid #ff8bb0',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: '18px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '700',
    color: '#2e3550',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    fontSize: '15px',
    color: '#1d2333',
    backgroundColor: '#fffdf7',
    border: '2px solid #f8bfd2',
    borderRadius: '12px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  button: {
    width: '100%',
    padding: '15px',
    marginTop: '6px',
    fontSize: '16px',
    fontWeight: '800',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 10px 18px rgba(255, 79, 138, 0.35)',
  },
  footerText: {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '15px',
    color: '#5f4b58',
    fontWeight: '600',
  },
  link: {
    color: '#cb1364',
    fontWeight: '800',
    textDecoration: 'none',
    marginLeft: '6px',
  },
};

export default Login;
