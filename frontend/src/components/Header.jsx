import { Search, Bell, ChevronDown } from 'lucide-react';
import './Header.css';

export default function Header() {
  return (
    <header className="header" id="header">
      <div className="header-search">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search evidence, cases, officers..."
          id="global-search"
        />
      </div>

      <div className="header-actions">
        <button className="header-btn notification-btn" id="notification-btn">
          <Bell size={20} />
          <span className="notification-badge">3</span>
        </button>

        <div className="header-user" id="header-user">
          <div className="header-avatar">
            <img
              src="https://ui-avatars.com/api/?name=Somchai+K&background=3b82f6&color=fff&bold=true&size=32"
              alt="Officer Somchai"
            />
          </div>
          <div className="header-user-info">
            <span className="header-user-name">Officer Somchai</span>
            <span className="header-user-role">Investigator</span>
          </div>
          <ChevronDown size={16} className="header-chevron" />
        </div>
      </div>
    </header>
  );
}
