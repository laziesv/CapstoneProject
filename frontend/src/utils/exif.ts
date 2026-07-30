// ── อ่านวันเวลาที่ถ่ายจาก EXIF ของรูป (เขียนเอง ไม่เพิ่มไลบรารี) ──
// รองรับ JPEG — parse APP1(Exif) → TIFF → IFD0 → Exif IFD → DateTimeOriginal
// ใช้ดึง "วันเวลาที่ถ่าย" จากไฟล์รูปโดยตรง (ติดมากับไฟล์ พิสูจน์ย้อนได้ ต่างจากค่าที่พิมพ์เอง)

/** อ่านวันเวลาที่ถ่ายจากไฟล์รูป — คืน "YYYY-MM-DDTHH:MM" หรือ "" ถ้าไม่มี/ไม่รองรับ */
export async function readCapturedAt(file: File): Promise<string> {
  try {
    if (!file.type.startsWith("image/")) return "";
    const buf = await file.arrayBuffer();
    return toLocalDateTime(parseJpegExif(new DataView(buf)));
  } catch {
    return "";
  }
}

/** EXIF DateTimeOriginal "YYYY:MM:DD HH:MM:SS" → ค่า datetime-local "YYYY-MM-DDTHH:MM" */
function toLocalDateTime(s: string): string {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : "";
}

function parseJpegExif(view: DataView): string {
  // JPEG ต้องขึ้นต้น 0xFFD8
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return "";

  let offset = 2;
  // เดินหา APP1 marker (0xFFE1)
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1) {
      // ตรวจ "Exif\0\0"
      const exifStart = offset + 4;
      if (
        view.getUint32(exifStart) === 0x45786966 && // "Exif"
        view.getUint16(exifStart + 4) === 0x0000
      ) {
        return parseTiff(view, exifStart + 6);
      }
    }
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break; // ถึง scan data / marker เพี้ยน
    offset += 2 + size;
  }
  return "";
}

function parseTiff(view: DataView, tiffStart: number): string {
  // endianness: 0x4949 = little, 0x4D4D = big
  const endian = view.getUint16(tiffStart);
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return "";

  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);

  const ifd0 = tiffStart + u32(tiffStart + 4);

  // IFD0 เก็บแค่ pointer ไป Exif IFD (tag 0x8769) — วันเวลาถ่ายอยู่ใน IFD นั้น
  let exifPtr = 0;
  const count0 = u16(ifd0);
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (u16(entry) === 0x8769) {
      exifPtr = tiffStart + u32(entry + 8);
      break;
    }
  }
  if (!exifPtr) return "";

  // DateTimeOriginal (tag 0x9003) — ASCII 20 ไบต์ "YYYY:MM:DD HH:MM:SS\0"
  const exifCount = u16(exifPtr);
  for (let i = 0; i < exifCount; i++) {
    const entry = exifPtr + 2 + i * 12;
    if (u16(entry) === 0x9003) {
      const strOffset = tiffStart + u32(entry + 8);
      let s = "";
      for (let k = 0; k < 19 && strOffset + k < view.byteLength; k++) {
        const ch = view.getUint8(strOffset + k);
        if (ch === 0) break;
        s += String.fromCharCode(ch);
      }
      return s;
    }
  }
  return "";
}
