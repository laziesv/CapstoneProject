import cv2
import numpy as np
import qrcode
from pyzbar.pyzbar import decode, ZBarSymbol

class clQRcodec:
    
    @staticmethod
    def argb2gray(src: np.ndarray) -> np.ndarray:
        """
        แปลงภาพสีเป็นภาพ Grayscale 8-bit
        เทียบเท่ากับ argb2gray ใน C# (ใช้สมการ BT.601 ภายใน cv2)
        """
        if src is None or src.size == 0:
            return src
            
        # ตรวจสอบจำนวนแชนเนลของภาพ (Channels)
        if len(src.shape) == 3:
            if src.shape[2] == 4:
                # แปลงจาก BGRA เป็น Grayscale
                return cv2.cvtColor(src, cv2.COLOR_BGRA2GRAY)
            elif src.shape[2] == 3:
                # แปลงจาก BGR เป็น Grayscale
                return cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
        
        # ถ้าเป็น 8-bit grayscale อยู่แล้ว คืนค่ากลับไปเลย
        return src

    @staticmethod
    def generateQR_default(data: str) -> np.ndarray:
        """
        สร้าง QR Code แบบกำหนดค่า Pixel ต่อ Module เริ่มต้นที่ 20
        (ใช้ชื่อ method แยกเนื่องจาก Python ไม่รองรับ Method Overloading เหมือน C#)
        """
        # สร้าง QR Code ด้วย Error Correction Level H
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=20, # กำหนดขนาด 20 pixels ต่อ 1 module
            border=4     # ขอบสีขาว (Quiet Zone) ปกติจะอยู่ที่ 4 modules
        )
        qr.add_data(data)
        qr.make(fit=True)

        # สร้างภาพ (คืนค่าเป็น PIL Image) และแปลงเป็น Numpy Array (0-255)
        pil_img = qr.make_image(fill_color="black", back_color="white")
        raw_img = np.array(pil_img, dtype=np.uint8) * 255
        
        return raw_img # เป็น 8-bit Grayscale อยู่แล้ว

    @staticmethod
    def generateQR(data: str, pixel_size: int) -> np.ndarray:
        """
        สร้าง QR Code และสเกลให้ได้ขนาด pixel_size x pixel_size ตามที่ระบุ
        โดยใช้ Nearest-Neighbor เพื่อรักษาสีขอบให้คมชัด
        """
        # สร้างแบบไม่ขยายก่อน (box_size = 1)
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=1,
            border=4
        )
        qr.add_data(data)
        qr.make(fit=True)

        pil_img = qr.make_image(fill_color="black", back_color="white")
        raw_img = np.array(pil_img, dtype=np.uint8) * 255

        # คำนวณจำนวน Modules
        modules = raw_img.shape[0]
        
        # ถ้าขนาดเท่ากับที่ต้องการแล้ว ส่งกลับได้เลย
        if raw_img.shape[0] == pixel_size and raw_img.shape[1] == pixel_size:
            return raw_img

        # สเกลภาพโดยใช้ cv2.INTER_NEAREST (เทียบเท่า InterpolationMode.NearestNeighbor)
        scaled_img = cv2.resize(raw_img, (pixel_size, pixel_size), interpolation=cv2.INTER_NEAREST)
        
        return scaled_img

    @staticmethod
    def decodeQR(qr_image: np.ndarray) -> str:
        """
        อ่านข้อมูลจากภาพ QR Code โดยใช้หลายเทคนิคสลับกันเพื่อความแม่นยำ
        เทียบเท่ากับการใช้ Binarizers หลายๆ แบบใน ZXing ของ C#
        """
        if qr_image is None or qr_image.size == 0:
            return ""

        # การพยายามครั้งที่ 1: ใช้ PyZbar (ครอบคลุมและแม่นยำที่สุดใน Python)
        try:
            decoded_objects = decode(qr_image, symbols=[ZBarSymbol.QRCODE])
            for obj in decoded_objects:
                text = obj.data.decode('utf-8')
                if text:
                    return text
        except Exception:
            pass

        # การพยายามครั้งที่ 2: ใช้ OpenCV QRCodeDetector (เป็น Fallback)
        try:
            detector = cv2.QRCodeDetector()
            val, pts, qr_code = detector.detectAndDecode(qr_image)
            if val:
                return val
        except Exception:
            pass
            
        # การพยายามครั้งที่ 3: ปรับ Threshold ภาพด้วย Histogram แบบ Manual (คล้าย GlobalHistogramBinarizer) ก่อนอ่านด้วย PyZbar
        try:
            _, threshold_img = cv2.threshold(qr_image, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
            decoded_objects = decode(threshold_img, symbols=[ZBarSymbol.QRCODE])
            for obj in decoded_objects:
                text = obj.data.decode('utf-8')
                if text:
                    return text
        except Exception:
            pass

        return ""