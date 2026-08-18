"use client";

import { useEffect, useState, type ReactNode } from "react";

import { evidenceService } from "@/services";


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

    if (!fileId) return;

    evidenceService
      .preview(fileId)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreview({ fileId, objectUrl: createdUrl });
      })
      .catch(() => {
        if (!cancelled) setFailedFileId(fileId);
      });

    return () => {
      cancelled = true;
      // คืน Object URL ทุกครั้งที่เปลี่ยนไฟล์หรือถอด component เพื่อไม่ให้หน่วยความจำค้าง
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [fileId]);

  const loading = Boolean(
    fileId && preview?.fileId !== fileId && failedFileId !== fileId
  );
  if (loading) return loadingFallback ?? fallback;
  if (!fileId || preview?.fileId !== fileId) return fallback;
  return <img src={preview.objectUrl} alt={alt} className={className} />;
}
