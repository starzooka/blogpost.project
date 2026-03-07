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
      // Create the user in the database
      await api.post('/users/', { username, email, password });
      
      // On success, send them to login
      alert("Account created successfully! Please log in.");
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || "Signup failed. Try a different username or email.");
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', marginTop: '0', color: '#333' }}>Create Account</h2>
        
        {error && <div style={{ color: 'red', marginBottom: '15px', textAlign: 'center', backgroundColor: '#ffe6e6', padding: '10px', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontWeight: '600' }}>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ width: '100%', padding: '12px', marginTop: '8px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ fontWeight: '600' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px', marginTop: '8px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ fontWeight: '600' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px', marginTop: '8px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>
          <button type="submit" style={{ padding: '14px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold' }}>Sign Up</button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', color: '#666' }}>
          Already have an account? <Link to="/login" style={{ color: '#007BFF', textDecoration: 'none' }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;