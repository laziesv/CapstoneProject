import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import UploadEvidence from './pages/UploadEvidence';
import EvidenceVault from './pages/EvidenceVault';
import BlockchainLedger from './pages/BlockchainLedger';
import WatermarkVerify from './pages/WatermarkVerify';
import AccessLogs from './pages/AccessLogs';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout" id="app-layout">
        <Sidebar />
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadEvidence />} />
            <Route path="/vault" element={<EvidenceVault />} />
            <Route path="/blockchain" element={<BlockchainLedger />} />
            <Route path="/verify" element={<WatermarkVerify />} />
            <Route path="/logs" element={<AccessLogs />} />
            <Route path="/settings" element={<SettingsPlaceholder />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="settings-placeholder">
      <div className="page-header">
        <h1 className="page-title">⚙️ Settings</h1>
        <p className="page-subtitle">ตั้งค่าระบบ (อยู่ระหว่างพัฒนา)</p>
      </div>
      <div className="glass-card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
          หน้าตั้งค่าจะพร้อมใช้งานเร็วๆ นี้
        </p>
      </div>
    </div>
  );
}
