import { useEffect, useRef, useState } from 'react';
import api, { setSessionData } from '../api';

function Profile() {
  const [profile, setProfile] = useState(null);
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const avatarInputRef = useRef(null);

  const syncSessionAvatar = (nextAvatarUrl) => {
    setSessionData({ avatarUrl: nextAvatarUrl || '' });
    window.dispatchEvent(new Event('session-updated'));
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/me/profile');
        setProfile(response.data);
        setBio(response.data.bio || '');
        setLocation(response.data.location || '');
        setAvatarUrl(response.data.avatar_url || '');
        syncSessionAvatar(response.data.avatar_url || '');
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setStatus('');
    setError('');
    try {
      const response = await api.put('/me/profile', { bio, location, avatar_url: avatarUrl });
      setProfile(response.data);
      setAvatarUrl(response.data.avatar_url || '');
      syncSessionAvatar(response.data.avatar_url || '');
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile.');
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setAvatarUploading(true);
    setStatus('');
    setError('');
    try {
      const response = await api.put('/users/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextAvatarUrl = response.data?.avatar_url || '';
      setAvatarUrl(nextAvatarUrl);
      setProfile((prev) => (prev ? { ...prev, avatar_url: nextAvatarUrl } : prev));
      syncSessionAvatar(nextAvatarUrl);
      setStatus('Profile picture updated successfully.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile picture.');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return <div className="status-text">Loading profile...</div>;
  }

  if (error && !profile) {
    return <div className="status-text status-error">{error}</div>;
  }

  const initial = (profile?.username || 'U').slice(0, 1).toUpperCase();

  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>My Profile</h1>
        <p>Manage your public profile details and activity summary.</p>
      </header>

      <div className="account-layout">
        <aside className="card account-sidebar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile avatar" className="profile-avatar profile-avatar-image" />
          ) : (
            <div className="profile-avatar">{initial}</div>
          )}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="profile-avatar-input"
          />
          <button
            type="button"
            className="btn btn-muted profile-avatar-button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
          >
            {avatarUploading ? 'Uploading...' : 'Change Profile Picture'}
          </button>
          <h3>{profile?.username}</h3>
          <div className="info-row">
            <span>Email</span>
            <strong>{profile?.email}</strong>
          </div>
          <div className="info-row">
            <span>Posts</span>
            <strong>{profile?.posts_count || 0}</strong>
          </div>
          <div className="info-row">
            <span>Followers</span>
            <strong>{profile?.followers_count || 0}</strong>
          </div>
          <div className="info-row">
            <span>Following</span>
            <strong>{profile?.following_count || 0}</strong>
          </div>
        </aside>

        <article className="card account-main">
          <h2>Profile Information</h2>
          <form className="form-stack" onSubmit={handleSave}>
            <div>
              <label>Display Name</label>
              <input type="text" value={profile?.username || ''} disabled />
            </div>

            <div>
              <label>Avatar URL (optional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>

            <div>
              <label>Location</label>
              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City, Country"
              />
            </div>

            <div>
              <label>Bio</label>
              <textarea
                rows="5"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Tell your community a bit about yourself."
              />
            </div>

            <button type="submit" className="btn btn-primary settings-save">Save Changes</button>
          </form>
          {status && <p className="save-success">{status}</p>}
          {error && <div className="form-error">{error}</div>}
        </article>
      </div>
    </section>
  );
}

export default Profile;
