import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Hits the FastAPI endpoint to create a new user
      await api.post('/users/', { username, email, password });
      
      alert("Account created successfully! Please log in.");
      navigate('/login');
    } catch (err) {
      console.error("Signup failed:", err);
      setError(err.response?.data?.detail || "Signup failed. Try a different username or email.");
    }
  };

  return (
    <section className="page page-auth">
      <div className="auth-card">
        <h2>Create account</h2>
        <p>Join the community and start publishing your voice.</p>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-accent auth-submit">
            Sign Up
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </section>
  );
}

export default Signup;
