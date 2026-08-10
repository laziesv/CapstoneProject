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

def pad_to_multiple(img: np.ndarray, divisor: int) -> np.ndarray:
    h, w = img.shape[:2]
    new_h = int(np.ceil(h / divisor)) * divisor
    new_w = int(np.ceil(w / divisor)) * divisor
    pad_bottom = new_h - h
    pad_right = new_w - w
    if pad_bottom == 0 and pad_right == 0:
        return img
    return cv2.copyMakeBorder(img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REFLECT101)

def seq_to_img(seq: np.ndarray, size: int) -> np.ndarray:
    img_arr = np.where(seq > 0, 255, 0).astype(np.uint8)
    return img_arr.reshape((size, size))

def float_to_display(img_f32: np.ndarray) -> np.ndarray:
    return np.clip(img_f32, 0, 255).astype(np.uint8)

class DigitalWatermarkingSystem:
    """
    คลาสหลักสำหรับใช้งานใน FastAPI Router จัดการฝังและดึงลายน้ำ DWT + QIM
    """
    def __init__(self, level: int = 3, alpha: int = 80, k_arnold: int = 15):
        self.level = level
        self.alpha = alpha
        self.k_arnold = k_arnold

    def embed(self, image_array: np.ndarray, static_data: str, dynamic_hash: str) -> np.ndarray:
        """
        กระบวนการฝัง Double Watermarking
        รับ Input: np.ndarray ของภาพต้นฉบับ (Grayscale)
        คืนค่า: np.ndarray ภาพที่ฝังลายน้ำแล้ว (uint8 พร้อมสำหรับการบันทึก/ส่งกลับ)
        """
        target_size = 128 * (2 ** self.level) # ถ้า level 3 จะได้ 1024
        image_array = cv2.resize(image_array, (target_size, target_size), interpolation=cv2.INTER_CUBIC)
        # ----------------------------------------------------
        divisor = 2 ** self.level
        host_img_f32 = pad_to_multiple(image_array.astype(np.float32), divisor)

        # 1. ทำ DWT ภาพหลัก
        dwt_coeffs = clTBwavelet.dwt(host_img_f32, level=self.level)
        lh_band = clTBwavelet.get_subband(dwt_coeffs, "LH", self.level)
        hl_band = clTBwavelet.get_subband(dwt_coeffs, "HL", self.level)
        band_h, band_w = lh_band.shape
        qr_size = 128 

        # 2. สร้าง QR Code และ Sequence
        hashed_static_data = hashlib.sha256(static_data.encode('utf-8')).hexdigest()
        qr_static = clQRcodec.generateQR(hashed_static_data, pixel_size=qr_size)
        wm_seq_static = clWMseq.bm2seq(Image.fromarray(qr_static))

        qr_dynamic = clQRcodec.generateQR(dynamic_hash, pixel_size=qr_size)
        wm_seq_dynamic = clWMseq.bm2seq(Image.fromarray(qr_dynamic))

        # 3. กำหนด Seed ให้คงที่ตาม Dynamic Hash และทำ Arnold Scramble
        seed_value = int(hashlib.sha256(dynamic_hash.encode('utf-8')).hexdigest(), 16) % (10**8)
        np.random.seed(seed_value)
        signal_static_scrambled = clWMseq.arnold_scramble(wm_seq_static, k=self.k_arnold)
        signal_dynamic_scrambled = clWMseq.arnold_scramble(wm_seq_dynamic, k=self.k_arnold)

        # 4. กำหนดจุดฝัง (Center Embedding)
        start_y = (band_h - qr_size) // 2
        start_x = (band_w - qr_size) // 2

        lh_wm = copy.deepcopy(lh_band)
        hl_wm = copy.deepcopy(hl_band)

        # 5. ทำ QIM Embed ลงใน Patch
        patch_lh = lh_wm[start_y:start_y+qr_size, start_x:start_x+qr_size]
        patch_hl = hl_wm[start_y:start_y+qr_size, start_x:start_x+qr_size]
        
        lh_wm[start_y:start_y+qr_size, start_x:start_x+qr_size] = clWMseq.qim_embed(patch_lh, signal_static_scrambled, self.alpha)
        hl_wm[start_y:start_y+qr_size, start_x:start_x+qr_size] = clWMseq.qim_embed(patch_hl, signal_dynamic_scrambled, self.alpha)

        # 6. บันทึกและทำ Inverse DWT
        coeffs_wm = copy.deepcopy(dwt_coeffs)
        clTBwavelet.set_subband(coeffs_wm, lh_wm, "LH", self.level)
        clTBwavelet.set_subband(coeffs_wm, hl_wm, "HL", self.level)
        
        host_wm_f32 = clTBwavelet.inverse_dwt(coeffs_wm, level=self.level)

        return float_to_display(host_wm_f32)

    def extract(self, suspected_image: np.ndarray, reference_image: np.ndarray, dynamic_hash: str) -> tuple[np.ndarray, np.ndarray]:
        """
        กระบวนการสกัดลายน้ำสำหรับการ Verify ข้อมูลดิจิทัล (รับ Input แบบ np.ndarray)
        คืนค่า: Tuple ของภาพ QR Code (Static, Dynamic) ในรูปแบบ np.ndarray
        """
        # --- เพิ่มโค้ดส่วนนี้ (บังคับ Resize ภาพให้เป็น 1024x1024 ทั้งสองภาพให้ตรงกับตอนฝัง) ---
        target_size = 128 * (2 ** self.level) # ถ้า level 3 จะได้ 1024
        suspected_image = cv2.resize(suspected_image, (target_size, target_size), interpolation=cv2.INTER_CUBIC)
        reference_image = cv2.resize(reference_image, (target_size, target_size), interpolation=cv2.INTER_CUBIC)
        # -------------------------------------------------------------------------
        # สร้าง Seed ตอนถอดกลับเพื่อให้ตรงกับตอนฝัง
        seed_value = int(hashlib.sha256(dynamic_hash.encode('utf-8')).hexdigest(), 16) % (10**8)
        np.random.seed(seed_value)

        divisor = 2 ** self.level
        host_f32 = pad_to_multiple(reference_image.astype(np.float32), divisor)
        suspect_f32 = pad_to_multiple(suspected_image.astype(np.float32), divisor)

        # ทำ Image Registration ก่อนเพื่อแก้ Geometric Attacks
        aligned_f32 = ImageRegistration.align(suspect_f32, host_f32)

        dwt_ext = clTBwavelet.dwt(aligned_f32, level=self.level)
        lh_ext = clTBwavelet.get_subband(dwt_ext, "LH", self.level)
        hl_ext = clTBwavelet.get_subband(dwt_ext, "HL", self.level)

        band_h, band_w = lh_ext.shape
        qr_size = 128 
        start_y = (band_h - qr_size) // 2
        start_x = (band_w - qr_size) // 2

        ext_patch_lh = lh_ext[start_y:start_y+qr_size, start_x:start_x+qr_size]
        ext_patch_hl = hl_ext[start_y:start_y+qr_size, start_x:start_x+qr_size]

        # QIM Extract และ Descramble
        sig_ext_static_scrambled = clWMseq.qim_extract(ext_patch_lh, self.alpha)
        sig_ext_dynamic_scrambled = clWMseq.qim_extract(ext_patch_hl, self.alpha)

        sig_ext_static = clWMseq.arnold_descramble(sig_ext_static_scrambled, k=self.k_arnold)
        sig_ext_dynamic = clWMseq.arnold_descramble(sig_ext_dynamic_scrambled, k=self.k_arnold)

        qr_extr_static = seq_to_img(sig_ext_static, qr_size)
        qr_extr_dynamic = seq_to_img(sig_ext_dynamic, qr_size)

        return qr_extr_static, qr_extr_dynamic

    def evaluate_quality(self, original_img: np.ndarray, watermarked_img: np.ndarray) -> dict:
        """ ตรวจสอบคุณภาพหลังฝังลายน้ำ (เอาไว้ใช้ยิง Log หรือเขียนเทสได้) """
        orig_f32 = pad_to_multiple(original_img.astype(np.float32), 2**self.level)
        wm_f32 = pad_to_multiple(watermarked_img.astype(np.float32), 2**self.level)
        
        return {
            "MSE": mse(orig_f32, wm_f32),
            "SSIM": ssim(orig_f32, wm_f32, data_range=255.0)
        }