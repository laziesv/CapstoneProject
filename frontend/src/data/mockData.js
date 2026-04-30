// ============================================
// DEVA — Mock Data for UI Demo
// ============================================

export const dashboardStats = [
  { id: 'total', label: 'Total Evidence Items', value: '2,847', icon: 'FileText', trend: '+12%', color: 'var(--electric-blue)' },
  { id: 'verified', label: 'Verified Today', value: '156', icon: 'ShieldCheck', trend: '+8%', color: 'var(--emerald-green)' },
  { id: 'blockchain', label: 'Blockchain Transactions', value: '12,450', icon: 'Link', trend: '+23%', color: 'var(--teal-cyan)' },
  { id: 'officers', label: 'Active Officers', value: '34', icon: 'Users', trend: '', color: 'var(--amber-gold)' },
];

export const recentEvidence = [
  { id: 1, caseNumber: 'CASE-2026-0309', uploadTime: '09:30 PM', officer: 'Officer Somchai', status: 'verified', category: 'Crime Scene', thumbnail: 'https://picsum.photos/seed/ev1/400/300' },
  { id: 2, caseNumber: 'CASE-2026-0359', uploadTime: '09:39 PM', officer: 'Officer Somchai', status: 'pending', category: 'Forensic', thumbnail: 'https://picsum.photos/seed/ev2/400/300' },
  { id: 3, caseNumber: 'CASE-2026-0398', uploadTime: '05:39 PM', officer: 'Officer Somchai', status: 'verified', category: 'Document', thumbnail: 'https://picsum.photos/seed/ev3/400/300' },
  { id: 4, caseNumber: 'CASE-2026-0329', uploadTime: '05:39 PM', officer: 'Officer Somchai', status: 'pending', category: 'Surveillance', thumbnail: 'https://picsum.photos/seed/ev4/400/300' },
];

export const blockchainActivity = [
  { id: 1, time: '1:35:43 AM', txHash: '0x2da7dc348a0717...', action: 'Upload', status: 'confirmed' },
  { id: 2, time: '1:35:45 AM', txHash: '0x2d13d2aa8ef7d3...', action: 'Access', status: 'confirmed' },
  { id: 3, time: '1:35:38 AM', txHash: '0xa31b7a3886ef46...', action: 'Verify', status: 'pending' },
  { id: 4, time: '1:34:22 AM', txHash: '0x8f2c4a91b3e7d2...', action: 'Transfer', status: 'confirmed' },
  { id: 5, time: '1:33:11 AM', txHash: '0xc7e9f3a24d1b56...', action: 'Upload', status: 'confirmed' },
];

export const evidenceVaultItems = [
  { id: 1, caseNumber: 'CASE-2025-0142', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Crime Scene', thumbnail: 'https://picsum.photos/seed/vault1/400/300' },
  { id: 2, caseNumber: 'CASE-2026-0143', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Forensic', thumbnail: 'https://picsum.photos/seed/vault2/400/300' },
  { id: 3, caseNumber: 'CASE-2026-0148', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Document', thumbnail: 'https://picsum.photos/seed/vault3/400/300' },
  { id: 4, caseNumber: 'CASE-2026-0141', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Crime Scene', thumbnail: 'https://picsum.photos/seed/vault4/400/300' },
  { id: 5, caseNumber: 'CASE-2026-0133', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Surveillance', thumbnail: 'https://picsum.photos/seed/vault5/400/300' },
  { id: 6, caseNumber: 'CASE-2026-0144', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Forensic', thumbnail: 'https://picsum.photos/seed/vault6/400/300' },
  { id: 7, caseNumber: 'CASE-2026-0142', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Crime Scene', thumbnail: 'https://picsum.photos/seed/vault7/400/300' },
  { id: 8, caseNumber: 'CASE-2026-0143', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Forensic', thumbnail: 'https://picsum.photos/seed/vault8/400/300' },
  { id: 9, caseNumber: 'CASE-2026-0148', date: '2026-05-18 14:30', officer: 'Det. M. Rossi', verified: true, watermark: true, category: 'Document', thumbnail: 'https://picsum.photos/seed/vault9/400/300' },
];

export const blockchainTransactions = [
  { id: 1, txHash: '0x82a7c9aa810...', blockNumber: '#45,892', timestamp: '27 Jan \'23 19:33:38', action: 'Upload', evidenceId: '27031', officer: 'John Grinson', status: 'confirmed' },
  { id: 2, txHash: '0x82a7c9aa812...', blockNumber: '#45,892', timestamp: '27 Jan \'23 19:33:38', action: 'Upload', evidenceId: '27032', officer: 'Jawn Rimeck', status: 'confirmed' },
  { id: 3, txHash: '0x82a7c9aa813...', blockNumber: '#45,893', timestamp: '27 Jan \'23 19:33:38', action: 'Access', evidenceId: '27833', officer: 'Jewn Officer', status: 'pending' },
  { id: 4, txHash: '0x82a7c9aa812...', blockNumber: '#45,897', timestamp: '27 Jan \'23 19:33:38', action: 'Verify', evidenceId: '27834', officer: 'Mick Monon', status: 'pending' },
  { id: 5, txHash: '0x82a7c9aa810...', blockNumber: '#45,892', timestamp: '27 Jan \'23 19:33:38', action: 'Transfer', evidenceId: '37035', officer: 'Jewn Grinson', status: 'confirmed' },
  { id: 6, txHash: '0x82a7c9aa819...', blockNumber: '#45,893', timestamp: '27 Jan \'23 19:33:38', action: 'Access', evidenceId: '27836', officer: 'Jown Officer', status: 'pending' },
  { id: 7, txHash: '0x82a7c9aa818...', blockNumber: '#45,894', timestamp: '27 Jan \'23 19:33:38', action: 'Access', evidenceId: '27833', officer: 'Jown Officer', status: 'pending' },
  { id: 8, txHash: '0x82a7c9aa817...', blockNumber: '#45,893', timestamp: '27 Jan \'23 19:33:38', action: 'Verify', evidenceId: '27833', officer: 'Mick Monon', status: 'pending' },
  { id: 9, txHash: '0x82a7c9aa818...', blockNumber: '#45,892', timestamp: '27 Jan \'23 19:33:36', action: 'Transfer', evidenceId: '37035', officer: 'Jelin Brinson', status: 'pending' },
  { id: 10, txHash: '0x82a7c9aa819...', blockNumber: '#45,892', timestamp: '27 Jan \'23 19:33:38', action: 'Transfer', evidenceId: '27833', officer: 'Jown Officer', status: 'pending' },
];

export const blockchainBlocks = [
  { number: 1, hash: '#20d23288...', prevHash: 'S20AD8A0#000', timestamp: '16:137' },
  { number: 2, hash: '#E0US3588...', prevHash: 'S70A18M0000', timestamp: '15:198' },
  { number: 3, hash: '#S00033B8...', prevHash: 'S20AD8A0000', timestamp: '45,892' },
  { number: 4, hash: '#E0d53588...', prevHash: 'S00460f#000', timestamp: '45,103' },
];

export const networkStatus = {
  connectedNodes: 12,
  lastBlock: '#45,892',
  hashRate: '303k Mh/s',
  consensus: 'Active',
};

export const accessLogs = [
  { id: 1, timestamp: 'Jan 12:25\n3:36 AM', officer: 'Amam Blaison', badge: '#23', action: 'view', evidenceId: '0000567123', caseNumber: '16780233', txHash: 'https://0b3e8ab193be8b7a8952ac072a...' },
  { id: 2, timestamp: 'Jan 12:35\n3:35 AM', officer: 'Amam Binison', badge: '#21', action: 'view', evidenceId: '0000580123', caseNumber: '16780233', txHash: 'https://0b3c6ab19a8c602a9062ac072a...' },
  { id: 3, timestamp: 'Jan 12:23\n3:35 AM', officer: 'Jafian Banor', badge: '#34', action: 'download', evidenceId: '0000567123', caseNumber: '16780233', txHash: 'https://0b3e6ab193b50067996s6673ca...' },
  { id: 4, timestamp: 'Jan 12:25\n3:35 AM', officer: 'Amam Binison', badge: '#21', action: 'download', evidenceId: '0000580126', caseNumber: '16780233', txHash: 'https://0b3e8ab1946b807e0065a503a...' },
  { id: 5, timestamp: 'Jan 12:23\n3:35 AM', officer: 'Unauthy Attempt', badge: '#39', action: 'unauthorized', evidenceId: '0000587125', caseNumber: '16780233', txHash: 'https://0b5c9ab194b31308875d4555ad...' },
  { id: 6, timestamp: 'Jan 12:23\n3:35 AM', officer: 'John Borner', badge: '#23', action: 'unauthorized', evidenceId: '0000580126', caseNumber: '16780233', txHash: 'https://0e6aa3b30ab1a2dcda8e3953ed...' },
  { id: 7, timestamp: 'Jan 12:23\n3:35 AM', officer: 'Aranin Binison', badge: '#21', action: 'view', evidenceId: '0000567123', caseNumber: '16780233', txHash: 'https://0e523ab592b31308875edo27e5...' },
];

export const accessLogStats = [
  { id: 'total', label: 'Total Access Events', value: '8,924', icon: 'Activity' },
  { id: 'officers', label: 'Unique Officers', value: '34', icon: 'Users' },
  { id: 'today', label: 'Evidence Accessed Today', value: '87', icon: 'Eye' },
  { id: 'flagged', label: 'Flagged Activities', value: '2', icon: 'AlertTriangle', alert: true },
];

export const categories = ['Crime Scene', 'Forensic', 'Surveillance', 'Document'];
