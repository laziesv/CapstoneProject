"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { UploadCloud, X, Shield, ShieldCheck, Loader2, CheckCircle2, ChevronRight, ShieldAlert, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { caseService, evidenceService } from "@/services";
import { visibleCases } from "@/utils/caseAccess";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { readCapturedAt } from "@/utils/exif";
import { formatIncident } from "@/utils/format";
import type { Case, UploadEvidenceFile, UploadedEvidenceRef } from "@/interfaces";

type Step = 1 | 2 | 3;

/** ขั้นตอนที่ระบบทำกับ "แต่ละไฟล์" — ไล่ทีละบรรทัดในหน้า Authenticate */
const PHASES = ["อ่านไฟล์", "คำนวณ SHA-256", "ฝังลายน้ำ (LSB)", "บันทึกลง Blockchain"];
const PHASE_MS = 380;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ไฟล์ที่รออัพโหลด + metadata ของตัวเอง (1 รายการ = 1 หลักฐาน)
 *  exifCapturedAt อ่านครั้งเดียวตอนเพิ่มไฟล์ แล้วผูกติดกับไฟล์นั้นถาวร —
 *  ไม่มีทางที่ข้อมูลของรูปหนึ่งจะไปโผล่กับอีกรูป */
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
    router.push(`/cases/${caseId}`);
  };

  const stepLabels = ["Upload Images", "Review", "Authenticate"];
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Evidence</h1>
        <p className="text-sm text-muted mt-1">อัปโหลดหลักฐานพร้อมฝังลายน้ำและบันทึก Blockchain อัตโนมัติ</p>
      </div>

      {/* คดีที่กำลังอัพโหลด */}
      <div className="flex items-center gap-2 rounded-lg border border-primary-light bg-primary-light/30 px-4 py-2.5 text-sm">
        <span className="text-muted">อัพโหลดเป็นของคดี:</span>
        <span className="font-mono font-semibold text-primary">{activeCase.case_number}</span>
        <span className="text-text-secondary">— {activeCase.title}</span>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${step === i + 1 ? "bg-primary text-white" : step > i + 1 ? "bg-primary-light text-primary" : "bg-slate-100 text-muted"}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">{step > i + 1 ? "✓" : i + 1}</span>
              {label}
            </div>
            {i < stepLabels.length - 1 && <ChevronRight className="h-4 w-4 text-muted" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-border bg-surface p-6">
        {/* Step 1: Upload Images */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold">อัปโหลดภาพหลักฐาน</h2>
            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input type="file" id="file-input" multiple accept="image/*" onChange={(e) => handleFiles(Array.from(e.target.files || []))} className="hidden" />
              <UploadCloud className="mx-auto h-10 w-10 text-muted" />
              <p className="mt-2 text-sm">ลากไฟล์มาวาง หรือ คลิกเพื่อเลือก</p>
              <p className="text-xs text-muted mt-1">รองรับ JPG, PNG, TIFF — แต่ละรูปจะอ่านวันเวลาที่ถ่ายของตัวเองจากไฟล์อัตโนมัติ</p>
            </div>
            {items.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {items.map((it, i) => (
                  <div key={it.preview} className="relative rounded-lg overflow-hidden aspect-square bg-slate-100">
                    <img src={it.preview} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => removeFile(i)} className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => items.length > 0 && setStep(2)} disabled={items.length === 0} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Step 2: Review — metadata แยกรายไฟล์ */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold">ตรวจสอบข้อมูลก่อนส่ง</h2>
              <p className="mt-1 text-xs text-muted">แต่ละไฟล์จะถูกบันทึกเป็นหลักฐาน 1 ชิ้น พร้อมวันเวลาถ่ายของตัวเอง</p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-2xl text-sm">
              <div><span className="text-muted">Case:</span> <span className="font-medium">{activeCase.case_number}</span></div>
              <div><span className="text-muted">Files:</span> <span className="font-medium">{items.length} images</span></div>
              <div><span className="text-muted">Officer:</span> <span className="font-medium">{user.badge_number || user.full_name || user.username}</span></div>
            </div>

            {missingDates > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                มี {missingDates} ไฟล์ที่ไม่มีวันเวลาถ่ายฝังอยู่ — กรอกเองได้ และจะถูกบันทึกว่าเป็นค่าที่กรอกเอง ไม่ใช่ค่าจากไฟล์
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-2 pr-3 font-medium">ไฟล์</th>
                    <th className="pb-2 pr-3 font-medium">วันเวลาที่ถ่าย</th>
                    <th className="pb-2 font-medium">คำอธิบาย</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.preview} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <img src={it.preview} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
                          <span className="max-w-[10rem] truncate text-xs text-text-secondary" title={it.file.name}>{it.file.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        {it.exifCapturedAt ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-success-light px-2 py-0.5 text-xs font-medium text-success">จากไฟล์ (EXIF)</span>
                            <span className="text-xs font-medium">{formatIncident(it.exifCapturedAt)}</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input type="datetime-local" value={it.manualCapturedAt} onChange={(e) => updateItem(i, { manualCapturedAt: e.target.value })} className="h-9 w-full min-w-[12rem] rounded-lg border border-border px-2 text-xs outline-none focus:border-primary" />
                            {it.manualCapturedAt && (
                              <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">กรอกเอง</span>
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

            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 max-w-2xl">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              ฝังลายน้ำ + บันทึก Blockchain อัตโนมัติ
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover transition-colors">Back</button>
              <button onClick={handleSubmit} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                <Shield className="h-4 w-4" /> Upload &amp; Authenticate
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Authenticate — โชว์กลไกภายในทีละไฟล์ แล้วสรุป hash + QR */}
        {step === 3 && (
          <div className="space-y-5">
            {isProcessing ? (
              <>
                <div>
                  <h2 className="font-semibold">กำลังรับรองหลักฐาน</h2>
                  <p className="mt-1 text-xs text-muted">แต่ละไฟล์ถูกประมวลผลแยกกัน — hash ที่ได้จึงเป็นของไฟล์นั้นโดยเฉพาะ</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* รูปที่กำลังประมวลผล + เส้นสแกน */}
                  <div className="space-y-2">
                    <div className="scan-frame mx-auto max-w-sm rounded-xl border border-border bg-slate-900">
                      {items[activeIdx] && (
                        <img src={items[activeIdx].preview} alt="" className="w-full object-contain opacity-90" style={{ maxHeight: 260 }} />
                      )}
                      <div className="scan-line" />
                    </div>
                    <p className="text-center text-xs text-muted">
                      ไฟล์ <span className="font-medium text-foreground">{activeIdx + 1} / {items.length}</span>
                      {items[activeIdx] && <> · <span className="font-mono">{items[activeIdx].file.name}</span></>}
                    </p>
                  </div>

                  {/* ขั้นตอนของไฟล์ปัจจุบัน */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2.5 self-start">
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
              </>
            ) : (
              <>
                <div className="rounded-lg border border-success/20 bg-success-light p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" /> รับรองสำเร็จ {results?.length} ไฟล์ — ลายน้ำถูกฝังและบันทึกลง Blockchain แล้ว
                  </p>
                </div>

                <p className="text-xs text-muted">สแกน QR เพื่ออ่านค่า SHA-256 ของไฟล์นั้น ใช้เทียบกับ hash ของไฟล์ต้นฉบับได้</p>

                <div className="space-y-3">
                  {results?.map((r) => (
                    <div key={r.evidence_number} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
                      <div className="flex-shrink-0 rounded-lg bg-white p-2">
                        <QRCodeSVG value={r.file_hash_sha256} size={104} level="M" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-primary">{r.evidence_number}</span>
                          <span className="truncate text-xs text-text-secondary">{r.original_filename}</span>
                        </div>
                        <div>
                          <p className="text-xs text-muted">SHA-256</p>
                          <p className="break-all rounded bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-text-secondary">{r.file_hash_sha256}</p>
                        </div>
                        <p className="text-xs text-muted">
                          tx <span className="font-mono text-primary">{r.tx_hash.slice(0, 18)}…</span>
                          {" · "}block <span className="font-mono">#{r.block_number}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={goToCase} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                  ไปหน้าคดี <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
