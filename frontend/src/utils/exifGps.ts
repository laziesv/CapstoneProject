// ── อ่านพิกัด GPS จาก EXIF ของรูป (เขียนเอง ไม่เพิ่มไลบรารี) ──
// รองรับ JPEG — parse APP1(Exif) → TIFF → IFD0 → GPS IFD
// ใช้เพื่อดึง "สถานที่เกิดเหตุ" จากไฟล์รูปโดยตรง (แม่นแม้อัพทีหลัง)

export interface ExifGps {
  latitude: number;
  longitude: number;
  takenAt?: string; // DateTimeOriginal (EXIF) รูปแบบ "YYYY:MM:DD HH:MM:SS"
}

/** อ่าน GPS + วันเวลาถ่ายจากไฟล์รูป JPEG — คืน null ถ้าไม่มี/ไม่รองรับ */
export async function readGpsFromImage(file: File): Promise<ExifGps | null> {
  try {
    if (!file.type.startsWith("image/")) return null;
    const buf = await file.arrayBuffer();
    return parseJpegExif(new DataView(buf));
  } catch {
    return null;
  }
}

function parseJpegExif(view: DataView): ExifGps | null {
  // JPEG ต้องขึ้นต้น 0xFFD8
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

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
  return null;
}

function parseTiff(view: DataView, tiffStart: number): ExifGps | null {
  // endianness: 0x4949 = little, 0x4D4D = big
  const endian = view.getUint16(tiffStart);
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return null;

  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);

  const ifd0 = tiffStart + u32(tiffStart + 4);

  // หา GPS IFD pointer (tag 0x8825) และ Exif IFD pointer (0x8769)
  let gpsPtr = 0;
  let exifPtr = 0;
  const count0 = u16(ifd0);
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    const tag = u16(entry);
    if (tag === 0x8825) gpsPtr = tiffStart + u32(entry + 8);
    else if (tag === 0x8769) exifPtr = tiffStart + u32(entry + 8);
  }
  if (!gpsPtr) return null;

  // อ่าน GPS IFD
  let latRef = "";
  let lonRef = "";
  let lat: number | null = null;
  let lon: number | null = null;

  const gpsCount = u16(gpsPtr);
  for (let i = 0; i < gpsCount; i++) {
    const entry = gpsPtr + 2 + i * 12;
    const tag = u16(entry);
    switch (tag) {
      case 0x0001: // GPSLatitudeRef (N/S)
        latRef = String.fromCharCode(view.getUint8(entry + 8));
        break;
      case 0x0002: // GPSLatitude (3 rationals)
        lat = readDms(view, tiffStart + u32(entry + 8), little);
        break;
      case 0x0003: // GPSLongitudeRef (E/W)
        lonRef = String.fromCharCode(view.getUint8(entry + 8));
        break;
      case 0x0004: // GPSLongitude
        lon = readDms(view, tiffStart + u32(entry + 8), little);
        break;
    }
  }

  if (lat === null || lon === null) return null;
  if (latRef === "S") lat = -lat;
  if (lonRef === "W") lon = -lon;

  const result: ExifGps = { latitude: lat, longitude: lon };

  // DateTimeOriginal (Exif IFD tag 0x9003) — best effort
  if (exifPtr) {
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
        if (s) result.takenAt = s;
        break;
      }
    }
  }

  return result;
}

/** อ่าน 3 rational (degrees, minutes, seconds) → ทศนิยม */
function readDms(view: DataView, offset: number, little: boolean): number | null {
  const rational = (o: number) => {
    const num = view.getUint32(o, little);
    const den = view.getUint32(o + 4, little);
    return den === 0 ? 0 : num / den;
  };
  const deg = rational(offset);
  const min = rational(offset + 8);
  const sec = rational(offset + 16);
  const val = deg + min / 60 + sec / 3600;
  return Number.isFinite(val) ? val : null;
}
