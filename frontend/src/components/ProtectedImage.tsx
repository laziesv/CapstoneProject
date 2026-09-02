"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { getToken } from "@/utils/session";

/** <img> ที่กันคลิกขวา (Save image as…), ลากภาพออก, และเลือก/ไฮไลต์
 *  ใช้กับภาพหลักฐานทุกหน้า — เป็นการ "กันเบื้องต้น" เท่านั้น
 *  (ตัวกันจริงคือลายน้ำที่ฝังในภาพ ตามรอยได้แม้ภาพหลุดออกไป) */
export default function ProtectedImage({
  className = "",
  alt = "",
  src,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  if (typeof src === "string" && src.includes("/api/evidence-files/")) {
    return (
      <AuthenticatedEvidenceImage
        key={src}
        {...props}
        src={src}
        alt={alt}
        className={className}
      />
    );
  }

  return <BaseImage {...props} src={src} alt={alt} className={className} />;
}

function AuthenticatedEvidenceImage({
  src,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let active = true;
    const token = getToken();

    if (token) {
      fetch(src, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`โหลดภาพไม่สำเร็จ (${response.status})`);
          return response.blob();
        })
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setResolvedSrc(objectUrl);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setResolvedSrc(undefined);
          }
        });
    }

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return <BaseImage {...props} src={resolvedSrc} />;
}

function BaseImage({
  className = "",
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none [-webkit-user-drag:none] ${className}`}
    />
  );
}
