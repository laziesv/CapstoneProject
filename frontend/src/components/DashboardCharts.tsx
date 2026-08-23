// ── Dashboard charts (inline SVG, ไม่มี dependency) ──────
// กราฟ presentational ล้วน — รับ data ผ่าน props, วาดด้วย SVG ให้เข้าธีมและ responsive
// พาเลตประเภทการเข้าถึงผ่านการ validate ด้วย skill dataviz (CVD/คอนทราสต์)

export interface BarPoint {
  label: string; // ป้ายแกน x (สั้น) เช่น "18/8"
  full: string;  // ข้อความเต็มสำหรับ tooltip เช่น "18 ส.ค. 2026"
  value: number;
}

/** กราฟแท่งตามช่วงเวลา — ซีรีส์เดียว (ไม่ต้องมี legend) */
export function TimeBarChart({
  data,
  accent = "#1e3a8a",
}: {
  data: BarPoint[];
  accent?: string;
}) {
  const W = 720;
  const H = 220;
  const padL = 10;
  const padR = 10;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.max(3, slot * 0.55);
  // โชว์ป้ายแกน x ห่างๆ กันแน่น (ทุกๆ ~1/7 ของจำนวนแท่ง)
  const labelStep = Math.ceil(n / 8);

  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" preserveAspectRatio="xMidYMid meet">
        {/* เส้นสูงสุด + baseline (recessive) */}
        <line x1={padL} y1={padT} x2={W - padR} y2={padT} className="stroke-slate-200" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} className="stroke-slate-300" strokeWidth={1} />
        <text x={padL} y={padT - 5} className="fill-slate-400" style={{ fontSize: 11 }}>{max}</text>

        {data.map((d, i) => {
          const barH = (d.value / max) * plotH;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = baseY - barH;
          return (
            <g key={i}>
              {/* พื้นที่ hover เต็มความสูง (ให้ tooltip ทำงานแม้แท่ง 0) */}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent">
                <title>{`${d.full}: ${d.value} ครั้ง`}</title>
              </rect>
              {d.value > 0 && (
                <rect x={x} y={y} width={barW} height={barH} rx={3} style={{ fill: accent }}>
                  <title>{`${d.full}: ${d.value} ครั้ง`}</title>
                </rect>
              )}
              {i % labelStep === 0 && (
                <text x={padL + i * slot + slot / 2} y={baseY + 18} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!hasData && <p className="-mt-24 pb-16 text-center text-sm text-muted">ยังไม่มีข้อมูลในช่วงนี้</p>}
    </div>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** โดนัทสัดส่วน — categorical (มี legend + ค่า + %) */
export function ActionDonut({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2; // ช่องว่าง 2px ระหว่างส่วน (surface gap)

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-slate-100" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (s.value / total) * c;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${s.label}: ${s.value} ครั้ง (${Math.round((s.value / total) * 100)}%)`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{total}</span>
          <span className="text-[11px] text-muted">ครั้ง</span>
        </div>
      </div>

      {/* legend — identity ไม่พึ่งสีอย่างเดียว (มีชื่อ+ค่ากำกับ) */}
      <ul className="space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="w-20 capitalize">{s.label}</span>
            <span className="font-medium">{s.value}</span>
            <span className="text-xs text-muted">({total ? Math.round((s.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
