"use client";
import { useState } from "react";
import { UploadCloud, MapPin, X, Shield, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import { mockCases, currentUser } from "@/lib/mockData";

type Step = 1 | 2 | 3 | 4;

export default function UploadEvidencePage() {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(0);
  const [form, setForm] = useState({ caseId: "", category: "crime_scene", location: "", dateTime: "", description: "" });
  const [wm, setWm] = useState({ officerId: true, timestamp: true, gps: true });
  const [blockchain, setBlockchain] = useState(true);

  const handleFiles = (newFiles: File[]) => {
    const imgs = newFiles.filter((f) => f.type.startsWith("image/"));
    setFiles((p) => [...p, ...imgs]);
    setPreviews((p) => [...p, ...imgs.map((f) => URL.createObjectURL(f))]);
  };

  const removeFile = (i: number) => {
    setFiles((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setSubmitStep(1);
    const steps = [1, 2, 3, 4, 5];
    steps.forEach((s, i) => setTimeout(() => setSubmitStep(s), (i + 1) * 800));
    setTimeout(() => setIsSubmitting(false), 4500);
  };

  const stepLabels = ["Select Case", "Upload Images", "Metadata", "Review"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Evidence</h1>
        <p className="text-sm text-muted mt-1">อัปโหลดหลักฐานพร้อมฝังลายน้ำและบันทึก Blockchain อัตโนมัติ</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${step === i + 1 ? "bg-primary text-white" : step > i + 1 ? "bg-primary-light text-primary" : "bg-slate-100 text-muted"}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">{step > i + 1 ? "✓" : i + 1}</span>
              {label}
            </div>
            {i < 3 && <ChevronRight className="h-4 w-4 text-muted" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-border bg-surface p-6">
        {/* Step 1: Select Case */}
        {step === 1 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="font-semibold">เลือกคดีที่เกี่ยวข้อง</h2>
            <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} className="h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary">
              <option value="">-- เลือกคดี --</option>
              {mockCases.filter((c) => c.status !== "closed").map((c) => (
                <option key={c.case_id} value={c.case_id}>{c.case_number} — {c.title}</option>
              ))}
            </select>
            <button onClick={() => form.caseId && setStep(2)} disabled={!form.caseId} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">
              Next
            </button>
          </div>
        )}

        {/* Step 2: Upload Images */}
        {step === 2 && (
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
              <p className="text-xs text-muted mt-1">รองรับ JPG, PNG, TIFF, RAW</p>
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
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover transition-colors">Back</button>
              <button onClick={() => files.length > 0 && setStep(3)} disabled={files.length === 0} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Step 3: Metadata & Settings */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-semibold">ข้อมูลหลักฐาน & การตั้งค่า</h2>
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
                <label className="text-xs font-medium text-muted">Date & Time</label>
                <input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="max-w-2xl">
              <label className="text-xs font-medium text-muted">Location</label>
              <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="สถานที่เก็บหลักฐาน" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
            </div>
            <div className="max-w-2xl">
              <label className="text-xs font-medium text-muted">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบายหลักฐาน..." rows={3} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium mb-3">Watermark Settings</h3>
                {(["officerId", "timestamp", "gps"] as const).map((key) => (
                  <label key={key} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-text-secondary">Embed {key === "officerId" ? "Officer ID" : key === "timestamp" ? "Timestamp" : "GPS"}</span>
                    <input type="checkbox" checked={wm[key]} onChange={(e) => setWm({ ...wm, [key]: e.target.checked })} className="h-4 w-4 rounded accent-primary" />
                  </label>
                ))}
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium mb-3">Blockchain</h3>
                <label className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-text-secondary">Record to Blockchain</span>
                  <input type="checkbox" checked={blockchain} onChange={(e) => setBlockchain(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover transition-colors">Back</button>
              <button onClick={() => setStep(4)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-semibold">ตรวจสอบข้อมูลก่อนส่ง</h2>
            <div className="grid grid-cols-2 gap-4 max-w-2xl text-sm">
              <div><span className="text-muted">Case:</span> <span className="font-medium">{mockCases.find((c) => c.case_id === form.caseId)?.case_number}</span></div>
              <div><span className="text-muted">Files:</span> <span className="font-medium">{files.length} images</span></div>
              <div><span className="text-muted">Category:</span> <span className="font-medium">{form.category}</span></div>
              <div><span className="text-muted">Officer:</span> <span className="font-medium">{currentUser.badge_number}</span></div>
              <div><span className="text-muted">Watermark:</span> <span className="font-medium">{Object.entries(wm).filter(([, v]) => v).map(([k]) => k).join(", ")}</span></div>
              <div><span className="text-muted">Blockchain:</span> <span className="font-medium">{blockchain ? "Enabled" : "Disabled"}</span></div>
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
              <button onClick={() => setStep(3)} disabled={isSubmitting} className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-surface-hover disabled:opacity-40 transition-colors">Back</button>
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
