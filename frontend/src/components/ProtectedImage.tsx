import type { ImgHTMLAttributes } from "react";

/** <img> ที่กันคลิกขวา (Save image as…), ลากภาพออก, และเลือก/ไฮไลต์
 *  ใช้กับภาพหลักฐานทุกหน้า — เป็นการ "กันเบื้องต้น" เท่านั้น
 *  (ตัวกันจริงคือลายน้ำที่ฝังในภาพ ตามรอยได้แม้ภาพหลุดออกไป) */
export default function ProtectedImage({
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
