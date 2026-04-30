import { useState } from 'react';
import {
  Upload as UploadIcon,
  MapPin,
  Calendar,
  Shield,
  Copy,
} from 'lucide-react';
import './UploadEvidence.css';

export default function UploadEvidence() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    caseNumber: '',
    category: 'Crime Scene',
    location: '',
    dateTime: '',
    description: '',
    officer: 'Sgt. Somchai K. (@somchai.k)',
  });
  const [watermarkSettings, setWatermarkSettings] = useState({
    officerId: true,
    timestamp: true,
    gps: true,
  });
  const [blockchainEnabled, setBlockchainEnabled] = useState(true);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileInput = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Evidence uploaded and authenticated successfully! ✅');
  };

  return (
    <div className="upload-page">
      <div className="page-header">
        <div className="breadcrumb">
          <a href="/">Home</a>
          <span className="separator">›</span>
          <a href="/vault">Evidence</a>
          <span className="separator">›</span>
          <span>Upload New Evidence</span>
        </div>
        <h1 className="page-title">Upload New Evidence</h1>
        <p className="page-subtitle">อัปโหลดภาพถ่ายหลักฐานพร้อมระบบลายน้ำและบล็อกเชนอัตโนมัติ</p>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        {/* Drop Zone */}
        <div
          className={`drop-zone glass-card ${isDragging ? 'drop-zone-active' : ''} ${files.length > 0 ? 'has-files' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}
          id="drop-zone"
        >
          <input
            type="file"
            id="file-input"
            multiple
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          {files.length === 0 ? (
            <div className="drop-zone-content">
              <div className="drop-zone-icon">
                <UploadIcon size={40} />
              </div>
              <p className="drop-zone-text">
                Drag & drop evidence photos here or click to browse
              </p>
              <p className="drop-zone-hint">
                Supported formats: JPG, PNG, GNF, TIFF, RAW, etc.
              </p>
            </div>
          ) : (
            <div className="file-preview-grid">
              {files.map((file, index) => (
                <div className="file-preview" key={index}>
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                  />
                  <button
                    type="button"
                    className="file-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                  >
                    ×
                  </button>
                  <span className="file-name">{file.name}</span>
                </div>
              ))}
              <div className="file-add">
                <UploadIcon size={24} />
                <span>Add More</span>
              </div>
            </div>
          )}
        </div>

        {/* Form Fields */}
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Case Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="CASE-2026-XXXX"
              value={formData.caseNumber}
              onChange={(e) => setFormData({ ...formData, caseNumber: e.target.value })}
              id="case-number"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Evidence Category</label>
            <select
              className="form-select"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              id="evidence-category"
            >
              <option value="Crime Scene">Crime Scene</option>
              <option value="Forensic">Forensic</option>
              <option value="Surveillance">Surveillance</option>
              <option value="Document">Document</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Location</label>
          <div className="input-with-icon">
            <input
              type="text"
              className="form-input"
              placeholder="Enter evidence collection location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              id="location-input"
            />
            <MapPin size={18} className="input-icon" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Date & Time of Collection</label>
          <div className="input-with-icon">
            <input
              type="datetime-local"
              className="form-input"
              value={formData.dateTime}
              onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
              id="datetime-input"
            />
            <Calendar size={18} className="input-icon" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Description / Notes</label>
          <textarea
            className="form-textarea"
            placeholder="Describe the evidence, context, and any relevant notes..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            id="description-input"
          />
        </div>

        <div className="form-group" style={{ maxWidth: '500px' }}>
          <label className="form-label">Chain of Custody Officer</label>
          <input
            type="text"
            className="form-input"
            value={formData.officer}
            readOnly
            id="officer-input"
          />
        </div>

        {/* Settings Row */}
        <div className="settings-grid">
          {/* Watermark Settings */}
          <div className="settings-card glass-card" id="watermark-settings">
            <h3 className="settings-title">Watermark Settings</h3>
            <div className="settings-list">
              <div className="setting-item">
                <span>Embed Officer ID</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={watermarkSettings.officerId}
                    onChange={(e) =>
                      setWatermarkSettings({ ...watermarkSettings, officerId: e.target.checked })
                    }
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              <div className="setting-item">
                <span>Embed Timestamp</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={watermarkSettings.timestamp}
                    onChange={(e) =>
                      setWatermarkSettings({ ...watermarkSettings, timestamp: e.target.checked })
                    }
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              <div className="setting-item">
                <span>Embed GPS Coordinates</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={watermarkSettings.gps}
                    onChange={(e) =>
                      setWatermarkSettings({ ...watermarkSettings, gps: e.target.checked })
                    }
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </div>

          {/* Blockchain Recording */}
          <div className="settings-card glass-card" id="blockchain-settings">
            <h3 className="settings-title">Blockchain Recording</h3>
            <div className="settings-list">
              <div className="setting-item">
                <span>Record to Blockchain</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={blockchainEnabled}
                    onChange={(e) => setBlockchainEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {blockchainEnabled && (
                <div className="smart-contract-field">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>
                    Smart Contract
                  </label>
                  <div className="contract-hash">
                    <span className="mono">0x5b8da53d35a0993d44c1825c3ed955525a...</span>
                    <button type="button" className="copy-btn" title="Copy address">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="upload-actions">
          <button type="submit" className="btn btn-primary btn-upload" id="upload-btn">
            <Shield size={20} />
            <span>Upload & Authenticate</span>
          </button>
        </div>
      </form>
    </div>
  );
}
