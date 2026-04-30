import { useState } from 'react';
import {
  Search,
  Grid3X3,
  List,
  ShieldCheck,
  Droplets,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { evidenceVaultItems, categories } from '../data/mockData';
import './EvidenceVault.css';

export default function EvidenceVault() {
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('newest');
  const itemsPerPage = 9;
  const totalItems = 142;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="vault-page">
      <div className="page-header">
        <h1 className="page-title">Evidence Vault</h1>
        <p className="page-subtitle">คลังหลักฐานดิจิทัลทั้งหมดที่ผ่านการรับรอง</p>
      </div>

      {/* Search & Filters */}
      <div className="vault-filters glass-card" id="vault-filters">
        <div className="filter-search">
          <Search size={18} className="filter-search-icon" />
          <input
            type="text"
            className="form-input filter-search-input"
            placeholder="Search for Keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="vault-search"
          />
        </div>

        <div className="filter-row">
          <div className="filter-item">
            <label className="filter-label">Case Number</label>
            <select className="form-select filter-select" id="filter-case">
              <option>All Cases</option>
              <option>CASE-2026-0142</option>
              <option>CASE-2026-0143</option>
              <option>CASE-2026-0148</option>
            </select>
          </div>
          <div className="filter-item">
            <label className="filter-label">Date Range</label>
            <input type="date" className="form-input filter-select" id="filter-date" />
          </div>
          <div className="filter-item">
            <label className="filter-label">Officer</label>
            <select className="form-select filter-select" id="filter-officer">
              <option>All Officers</option>
              <option>Det. M. Rossi</option>
              <option>Det. R. Chen</option>
            </select>
          </div>
          <div className="filter-item">
            <label className="filter-label">Status</label>
            <select className="form-select filter-select" id="filter-status">
              <option>Active, Archived</option>
              <option>Active</option>
              <option>Archived</option>
            </select>
          </div>
          <div className="filter-item">
            <label className="filter-label">Category</label>
            <select className="form-select filter-select" id="filter-category">
              <option>All Categories</option>
              {categories.map((cat) => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-actions">
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'view-btn-active' : ''}`}
              onClick={() => setViewMode('grid')}
              id="view-grid"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'view-btn-active' : ''}`}
              onClick={() => setViewMode('list')}
              id="view-list"
            >
              <List size={18} />
            </button>
          </div>
          <select
            className="form-select sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            id="sort-select"
          >
            <option value="newest">Sort by Date (Newest)</option>
            <option value="oldest">Sort by Date (Oldest)</option>
            <option value="case">Sort by Case #</option>
          </select>
        </div>
      </div>

      {/* Evidence Grid */}
      <div className={`vault-grid ${viewMode === 'list' ? 'vault-list-view' : ''}`} id="evidence-grid">
        {evidenceVaultItems.map((item, index) => (
          <div
            className="vault-card"
            key={item.id}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="vault-card-thumb">
              <img src={item.thumbnail} alt={item.caseNumber} loading="lazy" />
              <div className="vault-card-overlay">
                <span className="vault-case-label mono">{item.caseNumber}</span>
                <div className="vault-watermark-badge">
                  <Droplets size={14} />
                  <span>Watermark</span>
                </div>
              </div>
            </div>
            <div className="vault-card-body">
              <div className="vault-card-status">
                {item.verified && (
                  <span className="badge badge-verified">
                    <ShieldCheck size={12} />
                    Blockchain Verified
                  </span>
                )}
              </div>
              <div className="vault-card-meta">
                <span className="vault-card-date">Uploaded: {item.date}</span>
                <span className="vault-card-officer">{item.officer}</span>
              </div>
              <button className="btn btn-secondary vault-detail-btn" id={`view-detail-${item.id}`}>
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="vault-pagination" id="pagination">
        <button
          className="btn btn-secondary pagination-btn"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <div className="pagination-numbers">
          {[1, 2, 3].map((num) => (
            <button
              key={num}
              className={`pagination-num ${num === currentPage ? 'pagination-num-active' : ''}`}
              onClick={() => setCurrentPage(num)}
            >
              {num}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary pagination-btn"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
        >
          Next
          <ChevronRight size={16} />
        </button>
        <span className="pagination-info">
          Displaying 1-{itemsPerPage} of {totalItems} items
        </span>
      </div>
    </div>
  );
}
