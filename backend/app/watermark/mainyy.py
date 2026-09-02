import numpy as np
import cv2
from skimage.metrics import structural_similarity as ssim
from skimage.metrics import mean_squared_error as mse
from PIL import Image
import copy
import hashlib

# นำเข้าไลบรารีที่กำหนด (ต้องมีไฟล์เหล่านี้อยู่ในโฟลเดอร์เดียวกัน)
from clTBwavelet import clTBwavelet
from clQRcodec import clQRcodec
from clprocess import clWMseq
# นำ scipy.signal.wiener ออกแล้วตามลอจิกล่าสุดที่ใช้ QIM Blind Extraction

class WatermarkEvaluator:
    @staticmethod
    def calculate_nc(original_wm: np.ndarray, extracted_wm: np.ndarray) -> float:
        w_orig = original_wm.flatten().astype(np.float64)
        w_extr = extracted_wm.flatten().astype(np.float64)

        numerator = np.sum(w_orig * w_extr)
        denominator = np.sqrt(np.sum(w_orig**2)) * np.sqrt(np.sum(w_extr**2))

        if denominator == 0:
            return 0.0
        return numerator / denominator

    @staticmethod
    def calculate_ber(qr_orig: np.ndarray, qr_extr: np.ndarray) -> float:
        orig_bin = (qr_orig.flatten() > 127).astype(int)
        extr_bin = (qr_extr.flatten() > 127).astype(int)
        
        errors = np.sum(orig_bin != extr_bin)
        total_bits = len(orig_bin)
        
        if total_bits == 0:
            return 0.0
        return errors / total_bits

class ImageAttacks:
    """ คลาสสำหรับจำลองการโจมตีภาพ รองรับ Float32 (ใช้สำหรับ Unit Testing ฝั่ง Backend) """
    
    @staticmethod
    def attack_jpeg(img_f32: np.ndarray, quality: int = 40) -> np.ndarray:
        """ การโจมตีด้วยการบีบอัด JPEG (อ้างอิงจาก Compression Quality: 0, 40, 80) """
        img_8u = np.clip(img_f32, 0, 255).astype(np.uint8)
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        _, encimg = cv2.imencode('.jpg', img_8u, encode_param)
        decimg = cv2.imdecode(encimg, cv2.IMREAD_GRAYSCALE)
        return decimg.astype(np.float32)

    @staticmethod
    def attack_crop(img_f32: np.ndarray, block_size: int = 152) -> np.ndarray:
        """ 
        การโจมตีด้วยการตัดภาพ (อ้างอิงจาก Cropping Block Size: 8, 152, 200)
        ทำการตัดภาพตามขนาด Block Size จากกึ่งกลางภาพ แล้วขยายกลับเป็นขนาดเดิม
        """
        h, w = img_f32.shape
        
        # ป้องกันไม่ให้ Block Size มีขนาดใหญ่กว่ารูปภาพจริง
        block_size = min(block_size, h, w)
        
        # หาจุดกึ่งกลางของภาพสำหรับเริ่มตัด
        start_y = (h - block_size) // 2
        start_x = (w - block_size) // 2
        
        cropped = img_f32[start_y:start_y+block_size, start_x:start_x+block_size]
        
        # ขยายภาพที่ตัดกลับไปเป็นขนาดเดิม
        return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_CUBIC)

    @staticmethod
    def attack_gaussian_noise(img_f32: np.ndarray, var: float = 0.4, mean: float = 0.0) -> np.ndarray:
        """ การโจมตีด้วยการเพิ่มสัญญาณรบกวน (อ้างอิงจาก Fausain (Noise): 0, 0.4, 0.8) """
        sigma = var ** 0.5
        
        # ปรับสเกลของ Sigma ให้เหมาะสมกับค่าระดับสี (0-255) เพื่อให้เห็นผลกระทบชัดเจน
        scale = 255.0 if img_f32.max() > 1.0 else 1.0
        noise = np.random.normal(mean, sigma * scale, img_f32.shape)
        
        noisy_img = img_f32 + noise
        return np.clip(noisy_img, 0, 255).astype(np.float32)

    @staticmethod
    def attack_rotate(img_f32: np.ndarray, angle: float = 5.0) -> np.ndarray:
        h, w = img_f32.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(img_f32, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT101)

    @staticmethod
    def attack_translate(img_f32: np.ndarray, shift_x: int = 15, shift_y: int = 15) -> np.ndarray:
        h, w = img_f32.shape
        M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
        return cv2.warpAffine(img_f32, M, (w, h), borderMode=cv2.BORDER_REFLECT101)

    @staticmethod
    def attack_download_simulation(img_f32: np.ndarray) -> np.ndarray:
        h, w = img_f32.shape
        small_f32 = cv2.resize(img_f32, (w//2, h//2), interpolation=cv2.INTER_AREA)
        compressed_f32 = ImageAttacks.attack_jpeg(small_f32, quality=60)
        return cv2.resize(compressed_f32, (w, h), interpolation=cv2.INTER_CUBIC)
class ImageRegistration:
    """ คลาสสำหรับจัดศูนย์รูปภาพ (Alignment) ก่อนสกัดลายน้ำ เพื่อแก้ปัญหา Geometric Attacks """
    @staticmethod
    def align(attacked_f32: np.ndarray, reference_f32: np.ndarray) -> np.ndarray:
        img_attacked_8u = np.clip(attacked_f32, 0, 255).astype(np.uint8)
        img_ref_8u = np.clip(reference_f32, 0, 255).astype(np.uint8)

        sift = cv2.SIFT_create()
        kp1, des1 = sift.detectAndCompute(img_attacked_8u, None)
        kp2, des2 = sift.detectAndCompute(img_ref_8u, None)

        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return attacked_f32

        matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        matches = matcher.knnMatch(des1, des2, k=2)

        good_matches = []
        for m_n in matches:
            if len(m_n) == 2:
                m, n = m_n
                if m.distance < 0.75 * n.distance:
                    good_matches.append(m)
            elif len(m_n) == 1:
                good_matches.append(m_n[0])

        if len(good_matches) < 4:
            return attacked_f32

        pts_attacked = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_ref = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        matrix, mask = cv2.findHomography(pts_attacked, pts_ref, cv2.RANSAC, 5.0)
        if matrix is None:
            return attacked_f32

        h, w = reference_f32.shape
        aligned_f32 = cv2.warpPerspective(attacked_f32, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT101)
        return aligned_f32


def seq_to_img(seq: np.ndarray, size: int) -> np.ndarray:
    img_arr = np.where(seq > 0, 255, 0).astype(np.uint8)
    return img_arr.reshape((size, size))

def float_to_display(img_f32: np.ndarray) -> np.ndarray:
    return np.clip(img_f32, 0, 255).astype(np.uint8)

class DigitalWatermarkingSystem:
    """
    คลาสหลักสำหรับใช้งานใน FastAPI Router จัดการฝังและดึงลายน้ำ DWT + QIM
 
    การเปลี่ยนแปลงหลักจากเวอร์ชันก่อนหน้า:
    - ไม่ resize ภาพทั้งใบอีกต่อไป ใช้ clTBwavelet.get_square_roi() ตัด ROI สี่เหลี่ยม
      จัตุรัสตรงกลางภาพ (ขนาดหารด้วย 2**level ลงตัว) มาทำ DWT + ฝัง/แกะลายน้ำ แล้วนำ
      ROI ที่แก้ไขแล้วกลับไปวางตำแหน่งเดิมด้วย clTBwavelet.place_square_roi() ส่วนพื้นที่
      อื่นของภาพจะไม่ถูกแตะต้อง
    - แยก static และ dynamic ออกเป็นคนละเมธอด:
        * embed_static()  : ใช้ครั้งเดียวตอนสร้างหลักฐานใหม่ ฝัง QR ของ hash(evidence_uuid)
                             ลงในแบนด์ LH เท่านั้น
        * embed_dynamic()  : ใช้ทุกครั้งที่มีการเข้าถึง (access) ภาพ รับภาพที่ผ่าน
                             embed_static() มาแล้ว (หรือภาพที่มี dynamic เดิมฝังอยู่แล้ว
                             จากการเข้าถึงครั้งก่อน ๆ) แล้วฝัง QR ของ dynamic hash ล่าสุด
                             (ที่ backend ได้จาก blockchain) ลงในแบนด์ HL ทับค่าที่ฝังไว้เดิม
                             ทำแบบนี้ซ้ำได้เรื่อย ๆ ทุกครั้งที่มีการเข้าถึง โดยจะได้ dynamic
                             ล่าสุดแทนที่ของเก่าเสมอ
    - extract() จะหาตำแหน่ง ROI จาก reference_image (ภาพอ้างอิง/ต้นทางที่ backend เก็บไว้)
      แล้วทำ Image Registration ก่อน เพื่อรองรับกรณีภาพที่ตรวจสอบถูกโจมตีด้วยการ
      หมุน/ครอป/เลื่อนตำแหน่ง จากนั้นจึงตัด ROI ตำแหน่งเดียวกันมาสกัดลายน้ำทั้งสองชุด
    """
 
    def __init__(self, level: int = 3, alpha: int = 80, k_arnold: int = 15, qr_size: int = 128):
        self.level = level
        self.alpha = alpha
        self.k_arnold = k_arnold
        # ขนาด QR ที่ต้องการฝัง (หน่วยพิกเซล) ค่าจริงที่ใช้จะถูกจำกัดไม่ให้เกินขนาด
        # แบนด์ที่มีอยู่จริงของ ROI (ดู _band_qr_size)
        self.qr_size = qr_size
 
    # ---------- Helper: จัดการ ROI ----------
    def _prepare_roi(self, image_array: np.ndarray):
        """
        ตัด ROI สี่เหลี่ยมจัตุรัสกลางภาพ (ขนาดหารด้วย 2**level ลงตัว) โดยไม่ resize
        ภาพทั้งใบ คืนค่า roi (float32, สำเนา), row_offset, col_offset, size
        """
        roi, row_off, col_off, size = clTBwavelet.get_square_roi(
            image_array.astype(np.float32), levels=self.level
        )
        return roi, row_off, col_off, size
 
    def _band_qr_size(self, roi_size: int) -> int:
        """ขนาด QR สูงสุดที่ฝังลงในแบนด์ของ ROI ขนาดนี้ได้ (ไม่เกิน self.qr_size)"""
        band_size = roi_size // (2 ** self.level)
        return min(self.qr_size, band_size)
 
    # ---------- ฝัง Static (ครั้งแรกที่สร้างหลักฐาน) ----------
    def embed_static(self, image_array: np.ndarray, evidence_uuid: str) -> np.ndarray:
        """
        ฝังลายน้ำ Static = QR ของ hash(evidence_uuid) ลงในแบนด์ LH ที่ตำแหน่ง ROI
        กลางภาพ ใช้ตอนสร้างภาพหลักฐานครั้งแรกเท่านั้น (ยังไม่มี dynamic)
        """
        working = np.copy(image_array).astype(np.float32)
        roi, row_off, col_off, size = self._prepare_roi(working)
        qr_size = self._band_qr_size(size)
 
        dwt_coeffs = clTBwavelet.dwt(roi, level=self.level)
        lh_band = clTBwavelet.get_subband(dwt_coeffs, "LH", self.level)
        band_h, band_w = lh_band.shape
 
        hashed_static_data = hashlib.sha256(evidence_uuid.encode('utf-8')).hexdigest()
        qr_static = clQRcodec.generateQR(hashed_static_data, pixel_size=qr_size)
        wm_seq_static = clWMseq.bm2seq(Image.fromarray(qr_static))
 
        # หมายเหตุ: arnold_scramble/descramble เป็นการแปลงเชิงกำหนด (deterministic) ตาม k
        # เพียงอย่างเดียว ไม่ได้พึ่งค่า seed แบบสุ่ม บรรทัด seed ด้านล่างคงไว้เพื่อรองรับ
        # ส่วนขยายในอนาคตที่อาจใช้ตำแหน่งฝังแบบสุ่ม
        seed_value = int(hashlib.sha256(evidence_uuid.encode('utf-8')).hexdigest(), 16) % (10 ** 8)
        np.random.seed(seed_value)
        signal_static_scrambled = clWMseq.arnold_scramble(wm_seq_static, k=self.k_arnold)
 
        start_y = (band_h - qr_size) // 2
        start_x = (band_w - qr_size) // 2
 
        lh_wm = copy.deepcopy(lh_band)
        patch_lh = lh_wm[start_y:start_y+qr_size, start_x:start_x+qr_size]
        lh_wm[start_y:start_y+qr_size, start_x:start_x+qr_size] = clWMseq.qim_embed(
            patch_lh, signal_static_scrambled, self.alpha
        )
 
        coeffs_wm = copy.deepcopy(dwt_coeffs)
        clTBwavelet.set_subband(coeffs_wm, lh_wm, "LH", self.level)
        roi_wm_f32 = clTBwavelet.inverse_dwt(coeffs_wm, level=self.level)
 
        clTBwavelet.place_square_roi(working, roi_wm_f32, row_off, col_off)
        return float_to_display(working)
 
    # ---------- ฝัง/แทนที่ Dynamic (ทุกครั้งที่มีการเข้าถึงภาพ) ----------
    def embed_dynamic(self, image_with_watermark: np.ndarray, dynamic_hash: str) -> np.ndarray:
        """
        ฝัง (หรือแทนที่) ลายน้ำ Dynamic = QR ของ dynamic_hash (ที่ backend รับมาจาก
        blockchain) ลงในแบนด์ HL ที่ตำแหน่ง ROI เดียวกับตอนฝัง static
 
        ใช้ทุกครั้งที่มีการเข้าถึง (access) ภาพ: รับภาพที่ผ่าน embed_static() มาแล้ว
        ในการเข้าถึงครั้งแรก หรือรับภาพที่มี dynamic เดิมฝังอยู่แล้วจากการเข้าถึงครั้งก่อน
        ในการเข้าถึงครั้งถัดไป แล้วฝัง dynamic_hash ล่าสุดทับตำแหน่งเดิม ทำซ้ำแบบนี้ได้
        เรื่อย ๆ โดย static เดิมในแบนด์ LH จะไม่ถูกกระทบ
        """
        working = np.copy(image_with_watermark).astype(np.float32)
        roi, row_off, col_off, size = self._prepare_roi(working)
        qr_size = self._band_qr_size(size)
 
        dwt_coeffs = clTBwavelet.dwt(roi, level=self.level)
        hl_band = clTBwavelet.get_subband(dwt_coeffs, "HL", self.level)
        band_h, band_w = hl_band.shape
 
        qr_dynamic = clQRcodec.generateQR(dynamic_hash, pixel_size=qr_size)
        wm_seq_dynamic = clWMseq.bm2seq(Image.fromarray(qr_dynamic))
 
        seed_value = int(hashlib.sha256(dynamic_hash.encode('utf-8')).hexdigest(), 16) % (10 ** 8)
        np.random.seed(seed_value)
        signal_dynamic_scrambled = clWMseq.arnold_scramble(wm_seq_dynamic, k=self.k_arnold)
 
        start_y = (band_h - qr_size) // 2
        start_x = (band_w - qr_size) // 2
 
        hl_wm = copy.deepcopy(hl_band)
        patch_hl = hl_wm[start_y:start_y+qr_size, start_x:start_x+qr_size]
        hl_wm[start_y:start_y+qr_size, start_x:start_x+qr_size] = clWMseq.qim_embed(
            patch_hl, signal_dynamic_scrambled, self.alpha
        )
 
        coeffs_wm = copy.deepcopy(dwt_coeffs)
        clTBwavelet.set_subband(coeffs_wm, hl_wm, "HL", self.level)
        roi_wm_f32 = clTBwavelet.inverse_dwt(coeffs_wm, level=self.level)
 
        clTBwavelet.place_square_roi(working, roi_wm_f32, row_off, col_off)
        return float_to_display(working)
 
    # ---------- สกัดลายน้ำ (ใช้ตอน Verify) ----------
    def extract(self, suspected_image: np.ndarray, reference_image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        สกัดลายน้ำทั้ง Static และ Dynamic จากภาพที่ต้องการตรวจสอบ (suspected_image)
        โดยอิง reference_image (ภาพต้นทาง/ภาพอ้างอิงที่ backend เก็บไว้) เพื่อ
        1) หาตำแหน่ง ROI ที่ตรงกับตอนฝัง (คำนวณจาก reference_image)
        2) ทำ Image Registration แก้ปัญหา Geometric Attacks (หมุน/ครอป/เลื่อน) ก่อนตัด ROI
 
        คืนค่า: Tuple ของภาพ QR Code (Static, Dynamic) ในรูปแบบ np.ndarray
        ไม่มีการ resize ภาพทั้งใบ
        """
        suspect_f32 = suspected_image.astype(np.float32)
        reference_f32 = reference_image.astype(np.float32)
 
        # แก้ Geometric Attacks: จัดภาพที่สงสัยให้ตรงกับเรขาคณิตของภาพอ้างอิง
        aligned_f32 = ImageRegistration.align(suspect_f32, reference_f32)
 
        # ตำแหน่ง ROI ต้องคำนวณจากภาพอ้างอิง เพราะเป็นตำแหน่งเดียวกับตอนฝังจริง
        _, row_off, col_off, size = clTBwavelet.get_square_roi(reference_f32, levels=self.level)
        qr_size = self._band_qr_size(size)
 
        roi_suspect = aligned_f32[row_off:row_off+size, col_off:col_off+size].copy()
 
        dwt_ext = clTBwavelet.dwt(roi_suspect, level=self.level)
        lh_ext = clTBwavelet.get_subband(dwt_ext, "LH", self.level)
        hl_ext = clTBwavelet.get_subband(dwt_ext, "HL", self.level)
 
        band_h, band_w = lh_ext.shape
        start_y = (band_h - qr_size) // 2
        start_x = (band_w - qr_size) // 2
 
        ext_patch_lh = lh_ext[start_y:start_y+qr_size, start_x:start_x+qr_size]
        ext_patch_hl = hl_ext[start_y:start_y+qr_size, start_x:start_x+qr_size]
 
        # QIM Extract (Blind) ไม่ต้องใช้ dynamic_hash/seed ใด ๆ ในการสกัด
        sig_ext_static_scrambled = clWMseq.qim_extract(ext_patch_lh, self.alpha)
        sig_ext_dynamic_scrambled = clWMseq.qim_extract(ext_patch_hl, self.alpha)
 
        # Arnold descramble เป็น deterministic ตาม k เท่านั้น จึงไม่ต้องรู้ evidence_uuid
        # หรือ dynamic_hash ล่วงหน้าเพื่อถอดรหัสตำแหน่งพิกเซลกลับ
        sig_ext_static = clWMseq.arnold_descramble(sig_ext_static_scrambled, k=self.k_arnold)
        sig_ext_dynamic = clWMseq.arnold_descramble(sig_ext_dynamic_scrambled, k=self.k_arnold)
 
        qr_extr_static = seq_to_img(sig_ext_static, qr_size)
        qr_extr_dynamic = seq_to_img(sig_ext_dynamic, qr_size)
 
        return qr_extr_static, qr_extr_dynamic
 
    def evaluate_quality(self, original_img: np.ndarray, watermarked_img: np.ndarray) -> dict:
        """ ตรวจสอบคุณภาพหลังฝังลายน้ำ (เอาไว้ใช้ยิง Log หรือเขียนเทสได้) """
        orig_f32 = original_img.astype(np.float32)
        wm_f32 = watermarked_img.astype(np.float32)
 
        return {
            "MSE": mse(orig_f32, wm_f32),
            "SSIM": ssim(orig_f32, wm_f32, data_range=255.0)
        }
 