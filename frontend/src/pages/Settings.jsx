import { useEffect, useState } from 'react';
import api from '../api';

function Settings() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get('/me/settings');
        setEmailAlerts(Boolean(response.data.email_alerts));
        setWeeklyDigest(Boolean(response.data.weekly_digest));
        setCompactMode(Boolean(response.data.compact_mode));
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setStatus('');
    setError('');
    try {
      await api.put('/me/settings', {
        email_alerts: emailAlerts,
        weekly_digest: weeklyDigest,
        compact_mode: compactMode,
      });
      setStatus('Settings saved.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings.');
    }
  };

  if (loading) {
    return <div className="status-text">Loading settings...</div>;
  }

  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>Settings</h1>
        <p>Control your experience and notification preferences.</p>
      </header>

      <article className="card account-main">
        <h2>Preferences</h2>
        <form className="form-stack" onSubmit={handleSave}>
          <label className="toggle-row">
            <span>Email Alerts</span>
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(event) => setEmailAlerts(event.target.checked)}
            />
          </label>

          <label className="toggle-row">
            <span>Weekly Digest</span>
            <input
              type="checkbox"
              checked={weeklyDigest}
              onChange={(event) => setWeeklyDigest(event.target.checked)}
            />
          </label>

          <label className="toggle-row">
            <span>Compact Feed Layout</span>
            <input
              type="checkbox"
              checked={compactMode}
              onChange={(event) => setCompactMode(event.target.checked)}
            />
          </label>

          <button type="submit" className="btn btn-primary settings-save">Save Settings</button>
        </form>

        {status && <p className="save-success">{status}</p>}
        {error && <div className="form-error">{error}</div>}
      </article>
    </section>
  );
}

export default Settings;
