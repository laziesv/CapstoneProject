import { useState } from 'react';
import {
  Activity,
  Users,
  Eye,
  AlertTriangle,
  Download,
  ExternalLink,
  Calendar,
  Search,
  FileDown,
} from 'lucide-react';
import { accessLogs, accessLogStats } from '../data/mockData';
import './AccessLogs.css';

const iconMap = {
  Activity: Activity,
  Users: Users,
  Eye: Eye,
  AlertTriangle: AlertTriangle,
};

const actionIcons = {
  view: { icon: Eye, color: 'var(--teal-cyan)', label: 'View' },
  download: { icon: Download, color: 'var(--emerald-green)', label: 'Download' },
  unauthorized: { icon: AlertTriangle, color: 'var(--red-alert)', label: 'Unauthorized' },
};

export default function AccessLogs() {
  const [filters, setFilters] = useState({
    dateRange: 'Oct 2021 - Oct 2',
    officer: '',
    actionTypes: { view: true, download: true, unauthorized: false },
    evidenceId: '',
  });

  const getActionColor = (action) => {
    const map = {
      view: 'var(--teal-cyan)',
      download: 'var(--emerald-green)',
      unauthorized: 'var(--red-alert)',
    };
    return map[action] || 'var(--text-muted)';
  };

  const getCardBorder = (action) => {
    const map = {
      view: 'rgba(6, 182, 212, 0.3)',
      download: 'rgba(16, 185, 129, 0.3)',
      unauthorized: 'rgba(239, 68, 68, 0.5)',
    };
    return map[action] || 'var(--navy-border)';
  };

  const getCardBg = (action) => {
    const map = {
      view: 'rgba(6, 182, 212, 0.05)',
      download: 'rgba(16, 185, 129, 0.05)',
      unauthorized: 'rgba(239, 68, 68, 0.08)',
    };
    return map[action] || 'transparent';
  };

  return (
    <div className="logs-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Access Transaction Logs</h1>
            <p className="page-subtitle">Immutable blockchain-recorded access history</p>
          </div>
          <button className="btn btn-primary" id="export-audit-btn">
            <FileDown size={18} />
            Export Audit Report
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="logs-stats" id="access-stats">
        {accessLogStats.map((stat, index) => {
          const Icon = iconMap[stat.icon];
          return (
            <div
              className={`logs-stat-card glass-card ${stat.alert ? 'stat-alert' : ''}`}
              key={stat.id}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="logs-stat-top">
                <span className="logs-stat-label">{stat.label}</span>
                <Icon size={20} className={stat.alert ? 'stat-alert-icon' : ''} />
              </div>
              <div className="logs-stat-value">{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="logs-content">
        {/* Timeline */}
        <div className="logs-timeline" id="access-timeline">
          <div className="timeline-header">
            <div className="timeline-columns">
              <span>Officer</span>
              <span>Action</span>
              <span>Evidence ID</span>
              <span>Case Number</span>
            </div>
          </div>

          <div className="timeline-list">
            {accessLogs.map((log, index) => {
              const actionInfo = actionIcons[log.action];
              const ActionIcon = actionInfo.icon;
              return (
                <div
                  className="timeline-item"
                  key={log.id}
                  style={{
                    animationDelay: `${index * 0.05}s`,
                    borderColor: getCardBorder(log.action),
                    background: getCardBg(log.action),
                  }}
                >
                  <div className="timeline-time">{log.timestamp}</div>
                  <div className="timeline-card">
                    <div className="timeline-officer">
                      <img
                        src={`https://ui-avatars.com/api/?name=${log.officer.replace(/ /g, '+')}&background=162a46&color=94a3b8&size=36`}
                        alt={log.officer}
                        className="officer-avatar"
                      />
                      <div className="officer-details">
                        <span className="officer-name">{log.officer}</span>
                        <span className="officer-badge">Badge {log.badge}</span>
                      </div>
                    </div>

                    <div className="timeline-action">
                      <div
                        className="action-icon-wrapper"
                        style={{
                          background: `${getActionColor(log.action)}20`,
                          color: getActionColor(log.action),
                        }}
                      >
                        <ActionIcon size={18} />
                      </div>
                    </div>

                    <div className="timeline-evidence">
                      <span className="mono">{log.evidenceId}</span>
                    </div>

                    <div className="timeline-case">
                      <span className="mono">{log.caseNumber}</span>
                    </div>

                    <div className="timeline-tx">
                      <span className="tx-link" style={{ color: getActionColor(log.action) }}>
                        Blockchain TX <ExternalLink size={12} />
                      </span>
                      <span className="tx-hash-preview mono">{log.txHash}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter Panel */}
        <div className="logs-filter-panel glass-card" id="access-filters">
          <h3 className="section-title">Filter</h3>

          <div className="filter-section">
            <label className="form-label">Date Range</label>
            <div className="filter-date-range">
              <Calendar size={16} />
              <input
                type="text"
                className="form-input"
                defaultValue="Oct 2021 - Oct 2"
                readOnly
              />
            </div>
          </div>

          <div className="filter-section">
            <label className="form-label">Officer Filter</label>
            <select className="form-select" id="filter-officer-logs">
              <option>Select Officer</option>
              <option>Amam Blaison</option>
              <option>Jafian Banor</option>
            </select>
          </div>

          <div className="filter-section">
            <label className="form-label">Action Type</label>
            <div className="filter-checkboxes">
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.actionTypes.view}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      actionTypes: { ...filters.actionTypes, view: e.target.checked },
                    })
                  }
                />
                <span className="checkbox-custom" style={{ borderColor: 'var(--teal-cyan)' }} />
                <span>View</span>
              </label>
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.actionTypes.download}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      actionTypes: { ...filters.actionTypes, download: e.target.checked },
                    })
                  }
                />
                <span className="checkbox-custom" style={{ borderColor: 'var(--emerald-green)' }} />
                <span>Download</span>
              </label>
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.actionTypes.unauthorized}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      actionTypes: { ...filters.actionTypes, unauthorized: e.target.checked },
                    })
                  }
                />
                <span className="checkbox-custom" style={{ borderColor: 'var(--red-alert)' }} />
                <span>Modify Attempt</span>
              </label>
            </div>
          </div>

          <div className="filter-section">
            <label className="form-label">Evidence ID</label>
            <div className="filter-evidence-search">
              <Search size={14} />
              <input
                type="text"
                className="form-input"
                placeholder="Evidence ID"
                value={filters.evidenceId}
                onChange={(e) => setFilters({ ...filters, evidenceId: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
