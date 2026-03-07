import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Post from './pages/Post';
import Signup from './pages/Signup';

function App() {
  // Check if the user is currently logged in by looking for the token
  const token = localStorage.getItem('access_token');
  const username = localStorage.getItem('username');

  // Function to handle logging out
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    window.location.href = '/login'; // Redirect to login and reload
  };

  return (
    <Router>
      <div>
        {/* Dynamic Navbar */}
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', backgroundColor: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          
          {/* Left side: Navigation Links */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link to="/" style={{ textDecoration: 'none', color: '#007BFF', fontWeight: 'bold' }}>Home</Link>
            
            {/* ONLY show Login if there is NO token */}
            {!token && (
              <Link to="/login" style={{ textDecoration: 'none', color: '#007BFF', fontWeight: 'bold' }}>Login</Link>
            )}
          </div>

          {/* Right side: User Profile & Logout (ONLY show if token exists) */}
          {token && (
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: '#333' }}>Hello, {username?username.charAt(0).toUpperCase()+username.slice(1):""}</span>
              <button 
                onClick={handleLogout} 
                style={{ padding: '6px 12px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
              >
                Logout
              </button>
            </div>
          )}
          
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/post/:id" element={<Post />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;