import { useState } from 'react';
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import './WatermarkVerify.css';

export default function WatermarkVerify() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      simulateVerification();
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      simulateVerification();
    }
  };

  const simulateVerification = () => {
    setIsVerifying(true);
    setResult(null);
    setTimeout(() => {
      setIsVerifying(false);
      setResult({
        matchPercent: 98.7,
        officerId: 'OFF-2847',
        officerName: 'Sgt. Somchai',
        timestamp: '2026-04-15 14:32:07',
        gps: '13.7563°N, 100.5018°E',
        staticWatermark: 'intact',
        dynamicWatermark: 'intact',
        tamperingDetected: false,
      });
    }, 2000);
  };

  return (
    <div className="verify-page">
      <div className="page-header">
        <h1 className="page-title">Watermark Verification & Analysis</h1>
        <p className="page-subtitle">อัปโหลดภาพเพื่อตรวจสอบลายน้ำและความถูกต้องของหลักฐาน</p>
      </div>

      <div className="verify-main">
        {/* Upload Panel */}
        <div className="verify-upload glass-card" id="verify-upload">
          <h3 className="section-title">Upload Image for Verification</h3>
          <div
            className="verify-drop-zone"
            onClick={() => document.getElementById('verify-file-input').click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="verify-file-input"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {previewUrl ? (
              <div className="verify-preview">
                <img src={previewUrl} alt="Uploaded evidence" />
                {isVerifying && (
                  <div className="verify-scanning">
                    <div className="scan-line" />
                    <span>Analyzing watermark...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="verify-placeholder">
                <Upload size={40} />
                <p>Upload a suspect image</p>
                <span>Drag-and-drop zone.</span>
              </div>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="verify-results glass-card" id="verify-results">
          <h3 className="section-title">Verification Results</h3>

          {!result && !isVerifying && (
            <div className="verify-empty">
              <ShieldCheck size={48} />
              <p>Upload an image to start verification</p>
            </div>
          )}

          {isVerifying && (
            <div className="verify-loading">
              <div className="loading-spinner" />
              <p>Analyzing watermark data...</p>
            </div>
          )}

          {result && (
            <div className="verify-result-content">
              {/* Match Circle */}
              <div className="match-circle-wrapper">
                <svg viewBox="0 0 120 120" className="match-circle-svg">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--navy-border)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--emerald-green)"
                    strokeWidth="10"
                    strokeDasharray="314"
                    strokeDashoffset={314 * (1 - result.matchPercent / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                    className="match-progress"
                  />
                </svg>
                <div className="match-center">
                  <span className="match-value">{result.matchPercent}%</span>
                  <span className="match-label">Match</span>
                </div>
              </div>

              {/* Extracted Data */}
              <div className="extracted-data">
                <div className="data-row">
                  <span className="data-label">Officer ID</span>
                  <span className="data-value mono">{result.officerId}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Officer Name</span>
                  <span className="data-value">{result.officerName}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Timestamp</span>
                  <span className="data-value mono">{result.timestamp}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">GPS</span>
                  <span className="data-value mono">{result.gps}</span>
                </div>
              </div>

              {/* Watermark Status */}
              <div className="watermark-status-list">
                <div className="wm-status-item">
                  <span>Static Watermark:</span>
                  <span className={`wm-status wm-${result.staticWatermark}`}>
                    {result.staticWatermark === 'intact' ? (
                      <><CheckCircle2 size={16} /> Intact</>
                    ) : (
                      <><XCircle size={16} /> Tampered</>
                    )}
                  </span>
                </div>
                <div className="wm-status-item">
                  <span>Dynamic Watermark:</span>
                  <span className={`wm-status wm-${result.dynamicWatermark}`}>
                    {result.dynamicWatermark === 'intact' ? (
                      <><CheckCircle2 size={16} /> Intact</>
                    ) : (
                      <><XCircle size={16} /> Tampered</>
                    )}
                  </span>
                </div>
                <div className="wm-status-item">
                  <span>Tampering Detection:</span>
                  <span className={`wm-status ${result.tamperingDetected ? 'wm-tampered' : 'wm-intact'}`}>
                    {result.tamperingDetected ? (
                      <><ShieldAlert size={16} /> Tampering detected!</>
                    ) : (
                      <><CheckCircle2 size={16} /> No tampering detected</>
                    )}
                  </span>
                </div>
              </div>

              <button className="btn btn-primary verify-layer-btn" id="view-watermark-layer">
                <Eye size={18} />
                View Watermark Layer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Panel */}
      {result && (
        <div className="verify-comparison glass-card" id="comparison-panel">
          <h3 className="section-title">Original vs Submitted</h3>
          <div className="comparison-grid">
            <div className="comparison-panel">
              <div className="comparison-label">Original</div>
              <div className="comparison-image">
                <img
                  src="https://picsum.photos/seed/original_ev/600/400"
                  alt="Original evidence"
                />
              </div>
            </div>
            <div className="comparison-vs">VS</div>
            <div className="comparison-panel">
              <div className="comparison-label">Submitted</div>
              <div className="comparison-image">
                {previewUrl && (
                  <img src={previewUrl} alt="Submitted evidence" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
