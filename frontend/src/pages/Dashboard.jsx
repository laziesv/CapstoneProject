import { useEffect, useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Link,
  Users,
  TrendingUp,
  MoreHorizontal,
  Copy,
} from 'lucide-react';
import { dashboardStats, recentEvidence, blockchainActivity } from '../data/mockData';
import './Dashboard.css';

const iconMap = {
  FileText: FileText,
  ShieldCheck: ShieldCheck,
  Link: Link,
  Users: Users,
};

export default function Dashboard() {
  const [animatedValues, setAnimatedValues] = useState(
    dashboardStats.map(() => 0)
  );

  useEffect(() => {
    // Animate stat numbers on mount
    dashboardStats.forEach((stat, index) => {
      const target = parseInt(stat.value.replace(/,/g, ''));
      const duration = 1500;
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimatedValues((prev) => {
          const next = [...prev];
          next[index] = Math.floor(target * eased);
          return next;
        });
        if (progress < 1) requestAnimationFrame(animate);
      };
      setTimeout(() => requestAnimationFrame(animate), index * 100);
    });
  }, []);

  const formatNumber = (num) => num.toLocaleString();

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">ภาพรวมระบบคลังหลักฐานดิจิทัล</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" id="stats-grid">
        {dashboardStats.map((stat, index) => {
          const Icon = iconMap[stat.icon];
          return (
            <div
              className="stat-card glass-card"
              key={stat.id}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="stat-header">
                <span className="stat-label">{stat.label}</span>
                <div className="stat-icon" style={{ color: stat.color }}>
                  <Icon size={20} />
                </div>
              </div>
              <div className="stat-value">{formatNumber(animatedValues[index])}</div>
              {stat.trend && (
                <div className="stat-trend">
                  <TrendingUp size={14} />
                  <span>{stat.trend}</span>
                </div>
              )}
              <div className="stat-sparkline">
                <svg viewBox="0 0 120 30" className="sparkline-svg">
                  <path
                    d="M0,25 Q10,20 20,22 T40,18 T60,15 T80,10 T100,12 T120,5"
                    fill="none"
                    stroke={stat.color}
                    strokeWidth="2"
                    opacity="0.6"
                  />
                  <path
                    d="M0,25 Q10,20 20,22 T40,18 T60,15 T80,10 T100,12 T120,5 L120,30 L0,30 Z"
                    fill={stat.color}
                    opacity="0.1"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Recent Evidence */}
        <div className="dashboard-section evidence-section glass-card" id="recent-evidence">
          <div className="section-header">
            <h2 className="section-title">Recent Evidence Uploads</h2>
            <button className="btn btn-ghost">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="evidence-grid">
            {recentEvidence.map((ev) => (
              <div className="evidence-card" key={ev.id}>
                <div className="evidence-thumb">
                  <img src={ev.thumbnail} alt={ev.caseNumber} loading="lazy" />
                  <span className="evidence-category">{ev.category}</span>
                </div>
                <div className="evidence-info">
                  <span className="evidence-case mono">{ev.caseNumber}</span>
                  <span className="evidence-time">Upload time: {ev.uploadTime}</span>
                  <div className="evidence-footer">
                    <div className="evidence-officer">
                      <img
                        src={`https://ui-avatars.com/api/?name=${ev.officer.replace('Officer ', '')}&background=162a46&color=94a3b8&size=20`}
                        alt={ev.officer}
                        className="officer-mini-avatar"
                      />
                      <span>{ev.officer}</span>
                    </div>
                    <span className={`badge badge-${ev.status === 'verified' ? 'verified' : 'pending'}`}>
                      {ev.status === 'verified' ? '✓ Verified' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="dashboard-right">
          {/* Blockchain Activity Feed */}
          <div className="dashboard-section glass-card" id="blockchain-feed">
            <div className="section-header">
              <h2 className="section-title">Blockchain Activity Feed</h2>
              <button className="btn btn-ghost">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="activity-feed">
              {blockchainActivity.map((tx) => (
                <div className="activity-item" key={tx.id}>
                  <div className={`activity-dot ${tx.status}`} />
                  <div className="activity-content">
                    <div className="activity-time">{tx.time}</div>
                    <div className="activity-hash mono">
                      Transaction: {tx.txHash}
                      <button
                        className="copy-btn"
                        title="Copy"
                        onClick={() => navigator.clipboard.writeText(tx.txHash)}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                  <span className={`badge badge-${tx.action.toLowerCase()}`}>
                    {tx.action}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Watermark Integrity */}
          <div className="dashboard-section glass-card" id="watermark-integrity">
            <div className="section-header">
              <h2 className="section-title">Watermark Integrity</h2>
              <button className="btn btn-ghost">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="integrity-chart">
              <div className="donut-wrapper">
                <svg viewBox="0 0 120 120" className="donut-svg">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--navy-border)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--electric-blue)"
                    strokeWidth="12"
                    strokeDasharray="308"
                    strokeDashoffset="6"
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                    className="donut-progress"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--amber-gold)"
                    strokeWidth="12"
                    strokeDasharray="308"
                    strokeDashoffset="302"
                    strokeLinecap="round"
                    transform="rotate(345 60 60)"
                    className="donut-flagged"
                  />
                </svg>
                <div className="donut-center">
                  <span className="donut-percent">98%</span>
                </div>
              </div>
              <div className="integrity-legend">
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--electric-blue)' }} />
                  <span>98% Verified</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--amber-gold)' }} />
                  <span>2% Flagged</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
