import { useState } from 'react';
import {
  Copy,
  ChevronRight,
  ChevronDown,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  blockchainTransactions,
  blockchainBlocks,
  networkStatus,
} from '../data/mockData';
import './BlockchainLedger.css';

export default function BlockchainLedger() {
  const [expandedRow, setExpandedRow] = useState(null);

  const getActionBadge = (action) => {
    const classes = {
      Upload: 'badge-upload',
      Access: 'badge-access',
      Verify: 'badge-verify',
      Transfer: 'badge-transfer',
    };
    return classes[action] || 'badge-upload';
  };

  return (
    <div className="blockchain-page">
      <div className="page-header">
        <h1 className="page-title">Blockchain Transaction Ledger</h1>
        <p className="page-subtitle">บัญชีธุรกรรมบล็อกเชนที่บันทึกทุกการเข้าถึงหลักฐาน</p>
      </div>

      {/* Top Section: Chain Visualization + Network Status */}
      <div className="blockchain-top">
        {/* Chain Visualization */}
        <div className="chain-viz glass-card" id="chain-visualization">
          <h3 className="section-title">Blockchain Visualization</h3>
          <div className="chain-blocks">
            {blockchainBlocks.map((block, index) => (
              <div className="chain-block-wrapper" key={block.number}>
                <div className="chain-block">
                  <div className="block-hash mono">Hash: {block.hash}</div>
                  <div className="block-prev mono">{block.prevHash}</div>
                  <div className="block-time mono">Timestamp: {block.timestamp}</div>
                  <div className="block-number">Block {block.number}</div>
                </div>
                {index < blockchainBlocks.length - 1 && (
                  <div className="chain-connector">
                    <div className="connector-line" />
                    <div className="connector-dot" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Network Status */}
        <div className="network-status glass-card" id="network-status">
          <h3 className="section-title">Network Status</h3>
          <div className="status-list">
            <div className="status-row">
              <span className="status-label">Connected Nodes</span>
              <span className="status-value">{networkStatus.connectedNodes}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Last Block</span>
              <span className="status-value mono">{networkStatus.lastBlock}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Network Hash Rate</span>
              <span className="status-value">{networkStatus.hashRate}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Consensus</span>
              <span className="status-value consensus-active">
                <span className="status-dot confirmed" />
                {networkStatus.consensus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ledger-filters" id="ledger-filters">
        <div className="ledger-filter-group">
          <Calendar size={16} />
          <input type="date" className="form-input filter-date" defaultValue="2021-08-21" />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input type="date" className="form-input filter-date" defaultValue="2021-10-25" />
        </div>
        <select className="form-select" id="filter-action-type">
          <option>Action Type</option>
          <option>Upload</option>
          <option>Access</option>
          <option>Verify</option>
          <option>Transfer</option>
        </select>
        <select className="form-select" id="filter-all-officer">
          <option>All Officer</option>
          <option>John Grinson</option>
          <option>Mick Monon</option>
        </select>
      </div>

      {/* Transaction Table */}
      <div className="tx-table-wrapper glass-card" id="transaction-table">
        <table className="tx-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Transaction Hash</th>
              <th>Block Number</th>
              <th>Timestamp</th>
              <th>Action Type</th>
              <th>Evidence ID</th>
              <th>Officer</th>
              <th>Status</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {blockchainTransactions.map((tx) => (
              <>
                <tr
                  key={tx.id}
                  className={`tx-row ${expandedRow === tx.id ? 'tx-row-expanded' : ''}`}
                  onClick={() =>
                    setExpandedRow(expandedRow === tx.id ? null : tx.id)
                  }
                >
                  <td>
                    <span className="tx-expand-icon">
                      {expandedRow === tx.id ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                  </td>
                  <td>
                    <div className="tx-hash-cell">
                      <span className="mono">{tx.txHash}</span>
                      <button
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(tx.txHash);
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="mono">{tx.blockNumber}</td>
                  <td>{tx.timestamp}</td>
                  <td>
                    <span className={`badge ${getActionBadge(tx.action)}`}>
                      {tx.action}
                    </span>
                  </td>
                  <td className="mono">{tx.evidenceId}</td>
                  <td>{tx.officer}</td>
                  <td>
                    <span className={`tx-status ${tx.status}`}>
                      <span className={`status-dot ${tx.status}`} />
                      {tx.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    <ChevronRight size={14} className="tx-arrow" />
                  </td>
                </tr>
                {expandedRow === tx.id && (
                  <tr key={`${tx.id}-detail`} className="tx-detail-row">
                    <td colSpan={9}>
                      <div className="tx-detail-content">
                        <div className="tx-detail-item">
                          <span className="tx-detail-label">Full TX Hash:</span>
                          <span className="mono">{tx.txHash}a8b9c0d1e2f3</span>
                        </div>
                        <div className="tx-detail-item">
                          <span className="tx-detail-label">Gas Used:</span>
                          <span>21,000</span>
                        </div>
                        <div className="tx-detail-item">
                          <span className="tx-detail-label">Confirmations:</span>
                          <span>{tx.status === 'confirmed' ? '12' : '0'}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
