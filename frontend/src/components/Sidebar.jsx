import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Archive,
  Link,
  Search,
  ClipboardList,
  Settings,
  User,
  LogOut,
  Shield,
} from 'lucide-react';
import './Sidebar.css';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload Evidence' },
  { to: '/vault', icon: Archive, label: 'Evidence Vault' },
  { to: '/blockchain', icon: Link, label: 'Blockchain Ledger' },
  { to: '/verify', icon: Search, label: 'Watermark Verify' },
  { to: '/logs', icon: ClipboardList, label: 'Access Logs' },
];

const bottomItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar" id="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Shield size={24} />
        </div>
        <div className="logo-text">
          <span className="logo-name">DEVA</span>
          <span className="logo-subtitle">Digital Evidence Vault</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link-active' : ''}`
                }
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon size={20} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="nav-divider" />

        <ul className="nav-list nav-list-bottom">
          {bottomItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link-active' : ''}`
                }
              >
                <item.icon size={20} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button className="nav-link nav-link-logout" id="logout-btn">
              <LogOut size={20} className="nav-icon" />
              <span className="nav-label">Logout</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* User Badge */}
      <div className="sidebar-user">
        <div className="user-avatar">
          <User size={18} />
        </div>
        <div className="user-info">
          <span className="user-name">Sgt. Somchai</span>
          <span className="user-role">Investigator</span>
        </div>
      </div>
    </aside>
  );
}
