import { useEffect, useState } from 'react';
import api from '../api';

const STATUS_OPTIONS = ['open', 'in_review', 'resolved', 'dismissed'];

function Moderation() {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryResponse, reportsResponse] = await Promise.all([
        api.get('/moderation/summary'),
        api.get('/moderation/reports', { params: { status_filter: statusFilter || undefined, limit: 100 } }),
      ]);
      setSummary(summaryResponse.data);
      setReports(reportsResponse.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load moderation data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateReportStatus = async (report, nextStatus) => {
    const adminNote = window.prompt('Optional admin note:', report.admin_note || '') ?? '';
    try {
      const response = await api.patch(`/moderation/reports/${report.id}`, {
        status: nextStatus,
        admin_note: adminNote,
      });
      setReports((prev) => prev.map((item) => (item.id === report.id ? response.data : item)));
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update report.');
    }
  };

  return (
    <section className="page page-account">
      <header className="account-header">
        <h1>Moderation</h1>
        <p>Review reports and resolve policy issues across the community.</p>
      </header>

      <article className="card account-main">
        <div className="moderation-summary-row">
          <div className="summary-chip">
            <span>Open</span>
            <strong>{summary?.open_reports || 0}</strong>
          </div>
          <div className="summary-chip">
            <span>In Review</span>
            <strong>{summary?.in_review_reports || 0}</strong>
          </div>
          <div className="summary-chip">
            <span>Resolved</span>
            <strong>{summary?.resolved_reports || 0}</strong>
          </div>
        </div>

        <div className="moderation-filter-row">
          <label>
            <span>Status Filter</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-muted" onClick={fetchData}>Refresh</button>
        </div>

        {loading ? (
          <div className="status-text">Loading reports...</div>
        ) : error ? (
          <div className="status-text status-error">{error}</div>
        ) : reports.length === 0 ? (
          <div className="status-text">No reports found.</div>
        ) : (
          <div className="report-list">
            {reports.map((report) => (
              <article key={report.id} className="report-item">
                <div className="report-main">
                  <strong>#{report.id} {report.target_type}:{report.target_id}</strong>
                  <p>{report.reason}</p>
                  <small>
                    Reporter {report.reporter_id} • Status: {report.status} •
                    {' '}Created {new Date(report.created_at).toLocaleString()}
                  </small>
                  {report.admin_note && <p className="report-note">Admin note: {report.admin_note}</p>}
                </div>

                <div className="report-actions">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`btn btn-muted ${report.status === option ? 'is-active' : ''}`}
                      onClick={() => updateReportStatus(report, option)}
                      disabled={report.status === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default Moderation;
