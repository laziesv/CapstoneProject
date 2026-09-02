"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { UploadCloud, X, Shield, Loader2, CheckCircle2, ChevronRight, ShieldAlert, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedImage from "@/components/ProtectedImage";
import { caseService, evidenceService } from "@/services";
import { visibleCases } from "@/utils/caseAccess";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { readCapturedAt } from "@/utils/exif";
import { formatIncident } from "@/utils/format";
import type { Case, UploadEvidenceFile, UploadedEvidenceRef } from "@/interfaces";

type Step = 1 | 2 | 3;

/** ขั้นตอนที่ระบบทำกับ "แต่ละไฟล์" — ไล่ทีละบรรทัดในหน้า Authenticate */
const PHASES = ["อ่านไฟล์", "คำนวณ SHA-256", "ฝังลายน้ำ (DWT+QIM)", "บันทึกลง Blockchain"];
const PHASE_MS = 380;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ไฟล์ที่รออัพโหลด + metadata ของตัวเอง (1 รายการ = 1 หลักฐาน) */
interface PendingFile {
  file: File;
  preview: string;
  exifCapturedAt: string;   // จากไฟล์ ("" ถ้าไม่มี)
  manualCapturedAt: string; // ผู้ใช้กรอกเอง (ใช้เมื่อไฟล์ไม่มี EXIF)
  description: string;
}

const capturedAtOf = (p: PendingFile) => p.exifCapturedAt || p.manualCapturedAt;
const sourceOf = (p: PendingFile): UploadEvidenceFile["captured_at_source"] =>
  p.exifCapturedAt ? "exif" : p.manualCapturedAt ? "manual" : undefined;

const STEP_LABELS = ["เลือกไฟล์", "ตรวจข้อมูล", "รับรอง"];

export default function UploadEvidencePage() {
  const { user } = useAuth();
  const router = useRouter();
  const supervisorMap = useSupervisorMap();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [caseId, setCaseId] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  // ── สถานะของขั้น Authenticate ──
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);  // ไฟล์ที่กำลังประมวลผล
  const [phase, setPhase] = useState(0);          // ขั้นตอนของไฟล์นั้น
  const [results, setResults] = useState<UploadedEvidenceRef[] | null>(null);

  const myCases = useMemo(
    () => (cases ? visibleCases(user, cases, supervisorMap ?? {}) : []),
    [user, cases, supervisorMap]
  );
  const activeCase = useMemo(() => myCases.find((c) => c.case_id === caseId), [myCases, caseId]);

  useEffect(() => {
    (async () => {
      const loaded = await caseService.list();
      setCases(loaded);
      setCaseId(new URLSearchParams(window.location.search).get("case") ?? "");
    })();
  }, [user]);

  const handleFiles = async (newFiles: File[]) => {
    const imgs = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    // อ่าน EXIF ของแต่ละไฟล์ตอนเพิ่ม — ค่าที่ได้เป็นของไฟล์นั้นตลอดไป
    const added = await Promise.all(
      imgs.map(async (file) => ({
        file,
        preview: URL.createObjectURL(file),
        exifCapturedAt: await readCapturedAt(file),
        manualCapturedAt: "",
        description: "",
      }))
    );
    setItems((p) => [...p, ...added]);
  };

  const updateItem = (i: number, patch: Partial<PendingFile>) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const removeFile = (i: number) =>
    setItems((p) => {
      URL.revokeObjectURL(p[i].preview);
      return p.filter((_, idx) => idx !== i);
    });

  const clearAll = () =>
    setItems((p) => {
      p.forEach((it) => URL.revokeObjectURL(it.preview));
      return [];
    });

  const handleSubmit = async () => {
    setStep(3);
    setIsProcessing(true);
    setActiveIdx(0);
    setPhase(0);

    const refs = await evidenceService.upload({
      case_id: caseId,
      files: items.map((it) => ({
        file: it.file,
        description: it.description,
        captured_at: capturedAtOf(it) || undefined,
        captured_at_source: sourceOf(it),
      })),
    });

    // เดินขั้นตอนทีละไฟล์ให้เห็นว่าแต่ละไฟล์ถูกประมวลผลแยกกัน
    for (let i = 0; i < items.length; i++) {
      setActiveIdx(i);
      for (let p = 0; p < PHASES.length; p++) {
        setPhase(p);
        await sleep(PHASE_MS);
      }
      setPhase(PHASES.length); // ครบทุกขั้นของไฟล์นี้
      await sleep(200);
    }

    setResults(refs);
    setIsProcessing(false);
  };

  /** ออกจากหน้า — คืน object URL ของ preview ทั้งหมดก่อน */
  const goToCase = () => {
    items.forEach((it) => URL.revokeObjectURL(it.preview));
    router.push(`/cases/${activeCase?.case_number ?? caseId}`);
  };

  const missingDates = items.filter((it) => !capturedAtOf(it)).length;

  // ── Guards ──────────────────────────────────────────
  if (!user || cases === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user.role === "admin") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ผู้ดูแลระบบไม่ต้องใช้หน้านี้</p>
        <p className="text-sm text-muted">การอัพโหลดหลักฐานเป็นหน้าที่ของผู้รับผิดชอบคดี</p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← กลับไปหน้าคดี</Link>
      </div>
    );
  }

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-warning" />
        <p className="text-lg font-semibold">กรุณาเปิดจากคดีที่คุณรับผิดชอบ</p>
        <p className="text-sm text-muted">การอัพโหลดหลักฐานต้องเริ่มจากหน้าคดี (เพื่อผูกกับคดีที่ถูกต้อง)</p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← ไปหน้าคดี</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href={`/cases/${activeCase.case_number}`} className="font-mono text-sm text-muted transition-colors hover:text-primary">
          {activeCase.case_number}
        </Link>
        <span className="text-muted/60">/</span>
        <span className="text-base font-semibold">อัปโหลดหลักฐาน</span>
        <span className="ml-2 hidden truncate text-sm text-muted sm:inline">— {activeCase.title}</span>
      </div>

      {/* Step pills */}
      <div className="flex flex-wrap items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              step === i + 1 ? "bg-ink text-white" : step > i + 1 ? "bg-success-light text-success" : "bg-surface-hover text-muted"
            }`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === i + 1 ? "bg-white/20" : step > i + 1 ? "bg-success/20" : "bg-border/60"}`}>
                {step > i + 1 ? "✓" : i + 1}
              </span>
              {label}
            </div>
            {i < STEP_LABELS.length - 1 && <ChevronRight className="h-4 w-4 text-muted" />}
          </div>
        ))}
      </div>

      {/* ─────────────── STEP 1: เลือกไฟล์ ─────────────── */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              className={`flex cursor-pointer flex-col items-center gap-3.5 rounded-[20px] border-[1.5px] border-dashed p-12 text-center transition-colors ${
                isDragging ? "border-primary bg-primary-light/60" : "border-primary/60 bg-primary-light/30 hover:bg-primary-light/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input type="file" id="file-input" multiple accept="image/*" onChange={(e) => handleFiles(Array.from(e.target.files || []))} className="hidden" />
              <span className="flex items-center justify-center rounded-full bg-primary-light" style={{ width: 60, height: 60 }}>
                <UploadCloud className="h-6 w-6 text-primary" />
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="text-lg font-semibold">ลากไฟล์ภาพมาวางที่นี่</span>
                <span className="text-sm text-text-secondary">รองรับ JPG, PNG, TIFF — แต่ละรูปจะอ่านวันเวลาถ่ายจากไฟล์อัตโนมัติ</span>
              </div>
              <span className="mt-1 inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover">
                เลือกไฟล์จากเครื่อง
              </span>
            </div>

            {/* ไฟล์ที่เลือก */}
            {items.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <span className="text-[15px] font-semibold">ไฟล์ที่เลือก ({items.length})</span>
                  <button onClick={clearAll} className="text-[13px] font-semibold text-danger transition-opacity hover:opacity-70">ล้างทั้งหมด</button>
                </div>
                <ul className="divide-y divide-border">
                  {items.map((it, i) => (
                    <li key={it.preview} className="flex items-center gap-3.5 px-5 py-3.5">
                      <ProtectedImage src={it.preview} alt="" className="h-11 w-11 flex-shrink-0 rounded-[10px] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{it.file.name}</p>
                        <p className="font-mono text-xs text-muted">{(it.file.size / 1e6).toFixed(1)} MB</p>
                      </div>
                      {it.exifCapturedAt ? (
                        <span className="rounded-full bg-success-light px-2.5 py-1 text-xs font-semibold text-success">มีวันเวลาถ่าย</span>
                      ) : (
                        <span className="rounded-full bg-warning-light px-2.5 py-1 text-xs font-semibold text-warning">ไม่มี EXIF</span>
                      )}
                      <button onClick={() => removeFile(i)} aria-label="ลบ" className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-danger">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
              <span className="text-[15px] font-semibold">รายละเอียดหลักฐาน</span>
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-semibold">คดีที่เกี่ยวข้อง</label>
                <div className="flex h-12 items-center rounded-xl border border-border bg-surface-hover px-4 text-sm">
                  <span className="truncate"><span className="font-mono">{activeCase.case_number}</span> · {activeCase.title}</span>
                </div>
              </div>
              <p className="text-xs text-muted">คำอธิบายและวันเวลาถ่ายของแต่ละรูป จะกรอกในขั้นถัดไป (แยกรายไฟล์)</p>
            </div>

            <AutoStepsCard />

            <button
              onClick={() => items.length > 0 && setStep(2)}
              disabled={items.length === 0}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              ถัดไป — ตรวจข้อมูล <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────── STEP 2: ตรวจข้อมูล ─────────────── */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold">ตรวจสอบข้อมูลก่อนส่ง</h2>
                <p className="mt-0.5 text-xs text-muted">แต่ละไฟล์จะถูกบันทึกเป็นหลักฐาน 1 ชิ้น พร้อมวันเวลาถ่ายของตัวเอง</p>
              </div>

              {missingDates > 0 && (
                <p className="mx-5 mt-4 rounded-xl border border-warning/20 bg-warning-light px-4 py-2.5 text-xs text-warning">
                  มี {missingDates} ไฟล์ที่ไม่มีวันเวลาถ่ายฝังอยู่ — กรอกเองได้ และจะถูกบันทึกว่าเป็นค่าที่กรอกเอง ไม่ใช่ค่าจากไฟล์
                </p>
              )}

              <div className="overflow-x-auto p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="rounded-l-lg px-3 py-2.5 font-semibold">ไฟล์</th>
                      <th className="px-3 py-2.5 font-semibold">วันเวลาที่ถ่าย</th>
                      <th className="rounded-r-lg px-3 py-2.5 font-semibold">คำอธิบาย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((it, i) => (
                      <tr key={it.preview} className="align-top">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <ProtectedImage src={it.preview} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                            <span className="max-w-[9rem] truncate text-xs text-text-secondary" title={it.file.name}>{it.file.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          {it.exifCapturedAt ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-success-light px-2 py-0.5 text-xs font-semibold text-success">จากไฟล์ (EXIF)</span>
                              <span className="text-xs font-medium">{formatIncident(it.exifCapturedAt)}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <input type="datetime-local" value={it.manualCapturedAt} onChange={(e) => updateItem(i, { manualCapturedAt: e.target.value })} className="h-9 w-full min-w-[12rem] rounded-lg border border-border px-2 text-xs outline-none focus:border-primary" />
                              {it.manualCapturedAt && (
                                <span className="inline-block rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning">กรอกเอง</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <input type="text" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="คำอธิบายรูปนี้..." className="h-9 w-full rounded-lg border border-border px-2 text-xs outline-none focus:border-primary" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button onClick={() => setStep(1)} className="inline-flex h-12 items-center rounded-full border border-border bg-surface px-6 text-sm font-semibold transition-colors hover:bg-surface-hover">
                ย้อนกลับ
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
              <span className="text-[15px] font-semibold">สรุป</span>
              <SummaryRow label="คดี" value={activeCase.case_number} mono />
              <SummaryRow label="จำนวนไฟล์" value={`${items.length} รูป`} />
              <SummaryRow label="เจ้าหน้าที่" value={user.badge_number || user.full_name || user.username} />
            </div>

            <AutoStepsCard />

            <button onClick={handleSubmit} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover">
              <Shield className="h-4 w-4" /> อัปโหลดและบันทึกลงบล็อกเชน
            </button>
          </div>
        </div>
      )}

      {/* ─────────────── STEP 3: รับรอง ─────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {isProcessing ? (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-[15px] font-semibold">กำลังรับรองหลักฐาน</h2>
              <p className="mt-0.5 text-xs text-muted">แต่ละไฟล์ถูกประมวลผลแยกกัน — hash ที่ได้จึงเป็นของไฟล์นั้นโดยเฉพาะ</p>

              <div className="mt-5 grid gap-6 md:grid-cols-2">
                {/* รูปที่กำลังประมวลผล + เส้นสแกน */}
                <div className="space-y-2">
                  <div className="scan-frame mx-auto max-w-sm rounded-xl border border-border bg-slate-900">
                    {items[activeIdx] && (
                      <ProtectedImage src={items[activeIdx].preview} alt="" className="w-full object-contain opacity-90" style={{ maxHeight: 260 }} />
                    )}
                    <div className="scan-line" />
                  </div>
                  <p className="text-center text-xs text-muted">
                    ไฟล์ <span className="font-medium text-foreground">{activeIdx + 1} / {items.length}</span>
                    {items[activeIdx] && <> · <span className="font-mono">{items[activeIdx].file.name}</span></>}
                  </p>
                </div>

                {/* ขั้นตอนของไฟล์ปัจจุบัน */}
                <div className="flex flex-col gap-2.5 self-start rounded-xl border border-primary/20 bg-primary-light/40 p-4">
                  {PHASES.map((label, i) => (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      {phase > i ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : phase === i ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : <div className="h-4 w-4 rounded-full border border-border" />}
                      <span className={phase >= i ? "text-foreground" : "text-muted"}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-ink p-5 text-white">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/15">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold">รับรองสำเร็จ {results?.length} ไฟล์</p>
                  <p className="text-xs text-ink-muted">ลายน้ำถูกฝังและบันทึกลงบล็อกเชนแล้ว</p>
                </div>
              </div>

              <p className="text-xs text-muted">สแกน QR เพื่ออ่านค่า SHA-256 ของไฟล์นั้น ใช้เทียบกับ hash ของไฟล์ต้นฉบับได้</p>

              <div className="space-y-3">
                {results?.map((r) => (
                  <div key={r.evidence_number} className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
                    <div className="flex-shrink-0 rounded-xl bg-white p-2">
                      <QRCodeSVG value={r.file_hash_sha256} size={104} level="M" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">{r.evidence_number}</span>
                        <span className="truncate text-xs text-text-secondary">{r.original_filename}</span>
                      </div>
                      <div>
                        <p className="text-xs text-muted">SHA-256</p>
                        <p className="break-all rounded-lg bg-surface-hover p-2 font-mono text-[10px] leading-relaxed text-text-secondary">{r.file_hash_sha256}</p>
                      </div>
                      <p className="text-xs text-muted">
                        tx <span className="font-mono text-primary">{r.tx_hash.slice(0, 18)}…</span>
                        {" · "}block <span className="font-mono">#{r.block_number}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={goToCase} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
                ไปหน้าคดี <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** การ์ดดำ "ระบบจะทำอัตโนมัติ" — บอกกลไก 3 ขั้น */
function AutoStepsCard() {
  const bullets = [
    "ฝังลายน้ำระบุตัวเจ้าหน้าที่และเวลาลงในภาพ",
    "คำนวณแฮช SHA-256 ของไฟล์ต้นฉบับ",
    "บันทึกแฮชลงบล็อกเชนเพื่อยืนยันความถูกต้อง",
  ];
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] bg-ink text-white" style={{ padding: 22 }}>
      <span className="text-[15px] font-semibold">ระบบจะทำอัตโนมัติ</span>
      {bullets.map((b) => (
        <div key={b} className="flex items-start gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
          <span className="text-[13px] leading-snug text-ink-muted">{b}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
