"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ApiError, evidenceService } from "@/services";
import ProtectedImage from "@/components/ProtectedImage";


const unavailableFileIds = new Set<string>();


interface EvidencePreviewImageProps {
  fileId?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}


export function EvidencePreviewImage({
  fileId,
  alt,
  className,
  fallback = null,
  loadingFallback,
}: EvidencePreviewImageProps) {
  const [preview, setPreview] = useState<{ fileId: string; objectUrl: string }>();
  const [failedFileId, setFailedFileId] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | undefined;

    if (!fileId || unavailableFileIds.has(fileId)) return;

    evidenceService
      .preview(fileId)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreview({ fileId, objectUrl: createdUrl });
      })
      .catch((cause) => {
        // การแสดงไฟล์หลักฐาน: จดจำเฉพาะ 404 ของไฟล์ legacy เพื่อไม่ยิงคำขอซ้ำทุกครั้งที่ component ถูก mount
        if (cause instanceof ApiError && cause.status === 404) {
          unavailableFileIds.add(fileId);
        }
        if (!cancelled) setFailedFileId(fileId);
      });

    return () => {
      cancelled = true;
      // คืน Object URL ทุกครั้งที่เปลี่ยนไฟล์หรือถอด component เพื่อไม่ให้หน่วยความจำค้าง
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [fileId]);

  const loading = Boolean(
    fileId
      && preview?.fileId !== fileId
      && failedFileId !== fileId
      && !unavailableFileIds.has(fileId)
  );
  if (loading) return loadingFallback ?? fallback;
  if (!fileId || preview?.fileId !== fileId) return fallback;
  // ใช้ ProtectedImage เพื่อกันคลิกขวา/ลากภาพ ให้การนำหลักฐานออกต้องผ่านปุ่มดาวน์โหลด
  // ซึ่งบันทึกลง Blockchain และฝังลายน้ำระบุผู้โหลด
  return <ProtectedImage src={preview.objectUrl} alt={alt} className={className} />;
}
