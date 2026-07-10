"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UploadCloud, X, Shield, ShieldCheck, Loader2, CheckCircle2, ChevronRight, ShieldAlert, MapPin, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCases } from "@/utils/caseStore";
import { visibleCases } from "@/utils/caseAccess";
import { readGpsFromImage } from "@/utils/exifGps";
import type { Case } from "@/interfaces";

type Step = 1 | 2 | 3;

/** แปลง EXIF DateTimeOriginal "YYYY:MM:DD HH:MM:SS" → ค่า datetime-local "YYYY-MM-DDTHH:MM" */
function exifToLocal(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : "";
}

export default function UploadEvidencePage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [caseId, setCaseId] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(0);
  const [form, setForm] = useState({ category: "crime_scene", dateTime: "", description: "", location: "", latitude: "", longitude: "" });
  const [coordSource, setCoordSource] = useState<"" | "exif" | "manual">("");
  const [exifMissing, setExifMissing] = useState(false);

  const myCases = useMemo(
    () => (cases ? visibleCases(user, cases).filter((c) => c.status !== "closed") : []),
    [user, cases]
  );
  const activeCase = useMemo(() => myCases.find((c) => c.case_id === caseId), [myCases, caseId]);

  useEffect(() => {
    (async () => {
      const loaded = getCases();
      setCases(loaded);
      const preId = new URLSearchParams(window.location.search).get("case") ?? "";
      setCaseId(preId);
      // prefill ชื่อสถานที่เกิดเหตุจากคดี
      const c = visibleCases(user, loaded).find((x) => x.case_id === preId);
      if (c?.location) setForm((f) => ({ ...f, location: c.location }));
    })();
  }, [user]);

  const handleFiles = async (newFiles: File[]) => {
    const imgs = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setFiles((p) => [...p, ...imgs]);
    setPreviews((p) => [...p, ...imgs.map((f) => URL.createObjectURL(f))]);

    // ลองอ่านพิกัดจาก EXIF ของรูปแรก (ถ้ายังไม่มีพิกัด และผู้ใช้ยังไม่ได้กรอกเอง)
    if (coordSource !== "manual" && !form.latitude && !form.longitude) {
      const gps = await readGpsFromImage(imgs[0]);
      if (gps) {
        setForm((f) => ({
          ...f,
          latitude: gps.latitude.toFixed(6),
          longitude: gps.longitude.toFixed(6),
          dateTime: f.dateTime || exifToLocal(gps.takenAt),
        }));
        setCoordSource("exif");
        setExifMissing(false);
      } else {
        setExifMissing(true);
      }
    }
  };

  const removeFile = (i: number) => {
    setFiles((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  };

  const setCoord = (key: "latitude" | "longitude") => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setCoordSource("manual");
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setSubmitStep(1);
    const steps = [1, 2, 3, 4, 5];
    steps.forEach((s, i) => setTimeout(() => setSubmitStep(s), (i + 1) * 800));
    setTimeout(() => setIsSubmitting(false), 4500);
  };

  const stepLabels = ["Upload Images", "Metadata", "Review"];
  const hasCoords = form.latitude !== "" && form.longitude !== "";
  const mapsUrl = `https://www.google.com/maps?q=${form.latitude},${form.longitude}`;

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
        <Link href="/evidence" className="mt-2 text-sm text-primary hover:underline">← กลับไปคลังหลักฐาน</Link>
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
              <p className="text-xs text-muted mt-1">รองรับ JPG, PNG, TIFF — ระบบจะอ่านพิกัด GPS จากรูปให้อัตโนมัติ (ถ้ามี)</p>
            </div>
            {previews.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {previews.map((url, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden aspect-square bg-slate-100">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => removeFile(i)} className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => files.length > 0 && setStep(2)} disabled={files.length === 0} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Step 2: Metadata */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-semibold">ข้อมูลหลักฐาน</h2>
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-xs font-medium text-muted">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary">
                  <option value="crime_scene">Crime Scene</option>
                  <option value="forensic">Forensic</option>
                  <option value="surveillance">Surveillance</option>
                  <option value="document">Document</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">วันเวลาที่เกิดเหตุ/ถ่าย</label>
                <input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            {/* สถานที่เกิดเหตุ */}
            <div className="max-w-2xl space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">สถานที่เกิดเหตุ</h3>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">ชื่อสถานที่</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="เช่น ซ.สุขุมวิท 23 กรุงเทพฯ" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted">Latitude</label>
                  <input type="number" step="any" value={form.latitude} onChange={setCoord("latitude")} placeholder="13.756300" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Longitude</label>
                  <input type="number" step="any" value={form.longitude} onChange={setCoord("longitude")} placeholder="100.501800" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {coordSource === "exif" && <span className="rounded-full bg-success-light px-2 py-0.5 font-medium text-success">พิกัดจากรูป (EXIF)</span>}
                {coordSource === "manual" && hasCoords && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-text-secondary">กรอกเอง</span>}
                {hasCoords && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> ดูบนแผนที่
                  </a>
                )}
                {!hasCoords && exifMissing && <span className="text-muted">รูปนี้ไม่มีพิกัดฝังไว้ — กรอกพิกัดที่เกิดเหตุเอง (เช่นได้ภาพมาจากบุคคลอื่น)</span>}
              </div>
            </div>

            <div className="max-w-2xl">
              <label className="text-xs font-medium text-muted">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบายหลักฐาน..." rows={3} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 max-w-2xl">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              ระบบจะฝังลายน้ำ (Watermark) และบันทึกลง Blockchain ให้อัตโนมัติเมื่ออัพโหลด
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover transition-colors">Back</button>
              <button onClick={() => setStep(3)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-semibold">ตรวจสอบข้อมูลก่อนส่ง</h2>
            <div className="grid grid-cols-2 gap-4 max-w-2xl text-sm">
              <div><span className="text-muted">Case:</span> <span className="font-medium">{activeCase.case_number}</span></div>
              <div><span className="text-muted">Files:</span> <span className="font-medium">{files.length} images</span></div>
              <div><span className="text-muted">Category:</span> <span className="font-medium">{form.category}</span></div>
              <div><span className="text-muted">Officer:</span> <span className="font-medium">{user.badge_number || user.full_name || user.username}</span></div>
              <div className="col-span-2">
                <span className="text-muted">สถานที่เกิดเหตุ:</span>{" "}
                <span className="font-medium">
                  {form.location || "—"}
                  {hasCoords && <span className="font-mono text-xs text-muted"> ({form.latitude}, {form.longitude})</span>}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 max-w-2xl">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              ฝังลายน้ำ + บันทึก Blockchain อัตโนมัติ
            </div>

            {/* Submit Progress */}
            {isSubmitting && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2.5">
                {["Hashing metadata (SHA-256)", "Embedding watermark (LSB)", "Saving to storage", "Recording to blockchain", "Complete"].map((label, i) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    {submitStep > i + 1 ? <CheckCircle2 className="h-4 w-4 text-success" /> : submitStep === i + 1 ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <div className="h-4 w-4 rounded-full border border-border" />}
                    <span className={submitStep >= i + 1 ? "text-foreground" : "text-muted"}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {submitStep === 5 && !isSubmitting && (
              <div className="rounded-lg border border-success/20 bg-success-light p-4">
                <p className="text-sm font-medium text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> อัปโหลดสำเร็จ! ลายน้ำถูกฝังและบันทึกลง Blockchain แล้ว</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} disabled={isSubmitting} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover disabled:opacity-40 transition-colors">Back</button>
              <button onClick={handleSubmit} disabled={isSubmitting || submitStep === 5} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">
                <Shield className="h-4 w-4" /> Upload & Authenticate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
