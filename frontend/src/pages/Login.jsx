import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Added Link
import api from '../api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
      const response = await api.post('/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      
      // Store all user data
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('username', response.data.username); 
      localStorage.setItem('user_id', response.data.user_id); 
      
      // Force reload to update Navbar state
      window.location.href = '/'; 
      
    } catch (err) {
      console.error("Login failed:", err);
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 100px)' }}>
      
      <div style={{ width: '100%', maxWidth: '400px', padding: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', marginTop: '0', color: '#333' }}>Welcome Back</h2>
        
        {error && (
          <div style={{ color: 'red', marginBottom: '15px', textAlign: 'center', backgroundColor: '#ffe6e6', padding: '10px', borderRadius: '4px' }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#555' }}>Username or Email</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
              style={{ width: '100%', padding: '12px', marginTop: '8px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
          
          <div>
            <label style={{ fontWeight: '600', color: '#555' }}>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{ width: '100%', padding: '12px', marginTop: '8px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
          
          <button 
            type="submit" 
            style={{ padding: '14px', cursor: 'pointer', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', marginTop: '10px', transition: 'background-color 0.2s' }}
          >
            Login
          </button>
        </form>

        {/* Link to Signup Page */}
        <p style={{ textAlign: 'center', marginTop: '20px', color: '#666' }}>
          Don't have an account? <Link to="/signup" style={{ color: '#007BFF', textDecoration: 'none', fontWeight: 'bold' }}>Sign Up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;