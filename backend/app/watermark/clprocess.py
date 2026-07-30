import numpy as np
from PIL import Image

class clWMseq:
    @staticmethod
    def bm2seq(bm8bpp: Image.Image) -> np.ndarray:
        """
        แปลงรูปภาพ 8bpp เป็น 2D Array ของ 0 และ 1 (Thresholding)
        """
        # ทำให้แน่ใจว่ารูปภาพเป็นโหมด Grayscale (8-bit)
        if bm8bpp.mode != 'L':
            bm8bpp = bm8bpp.convert('L')
            
        # แปลงรูปภาพเป็น NumPy Array
        img_array = np.array(bm8bpp)
        
        # ถ้าระดับสี > 128 ให้เป็น 1 ถ้าไม่ใช่ให้เป็น 0
        seq = np.where(img_array > 128, 1, 0).astype(np.uint8)
        return seq

    @staticmethod
    def seq2bm(seq: np.ndarray) -> Image.Image:
        """
        แปลง 2D Array กลับเป็นรูปภาพ 8bpp Grayscale
        """
        # ถ้าค่า > 0 ให้เป็น 255 (สีขาว) ถ้าไม่ใช่ให้เป็น 0 (สีดำ)
        img_array = np.where(seq > 0, 255, 0).astype(np.uint8)
        
        # แปลง NumPy Array กลับเป็นรูปภาพโหมด 'L' (8-bit grayscale)
        bmp = Image.fromarray(img_array, mode='L')
        return bmp

    @staticmethod
    def combine(stream1: np.ndarray, stream2: np.ndarray) -> np.ndarray:
        """
        รวม 2D Array 2 ตัวเข้าด้วยกัน (Logical OR)
        """
        # ทำ Logical OR ระหว่างสอง Array แล้วแปลงค่ากลับเป็น 0 หรือ 1
        b1 = stream1 > 0
        b2 = stream2 > 0
        combined = np.logical_or(b1, b2).astype(np.uint8)
        
        return combined
    @staticmethod
    def arnold_scramble(matrix: np.ndarray, k: int) -> np.ndarray:
        """
        เข้ารหัสรูปภาพ 2D Array ด้วย Arnold Transform (ทำ Scramble)
        """
        N = matrix.shape[0] # Arnold Transform ต้องใช้กับภาพจัตุรัส (N x N)
        res = np.copy(matrix)
        x, y = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
        
        for _ in range(k):
            x_new = (x + y) % N
            y_new = (x + 2 * y) % N
            temp = np.zeros_like(res)
            temp[x_new, y_new] = res[x, y]
            res = temp
            
        return res

    @staticmethod
    def arnold_descramble(matrix: np.ndarray, k: int) -> np.ndarray:
        """
        ถอดรหัสรูปภาพ 2D Array ด้วย Inverse Arnold Transform (ทำ Descramble)
        """
        N = matrix.shape[0]
        res = np.copy(matrix)
        x, y = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
        
        for _ in range(k):
            x_new = (2 * x - y) % N
            y_new = (-x + y) % N
            temp = np.zeros_like(res)
            temp[x_new, y_new] = res[x, y]
            res = temp
            
        return res
    @staticmethod
    def qim_embed(coeffs: np.ndarray, bits: np.ndarray, delta: float) -> np.ndarray:
        """
        ฝังข้อมูลด้วยวิธี QIM 
        bits: 2D Array ของลายน้ำที่มีค่าเป็น 0 หรือ 1
        delta: Quantization Step Size (ความแรงของการฝัง)
        """
        # สร้าง Dither vector: บิต 0 ขยับ -delta/4, บิต 1 ขยับ +delta/4
        d = np.where(bits == 1, delta / 4.0, -delta / 4.0)
        
        # สมการ QIM Embedding
        coeffs_wm = np.round((coeffs - d) / delta) * delta + d
        return coeffs_wm

    @staticmethod
    def qim_extract(coeffs: np.ndarray, delta: float) -> np.ndarray:
        """
        สกัดข้อมูลด้วยวิธี QIM
        คืนค่ากลับเป็น 2D Array ของ 0 และ 1
        """
        d0 = -delta / 4.0
        d1 = delta / 4.0
        
        # คำนวณระยะห่างไปยัง Quantization Level ของบิต 0 และบิต 1
        val0 = np.round((coeffs - d0) / delta) * delta + d0
        val1 = np.round((coeffs - d1) / delta) * delta + d1
        
        dist0 = np.abs(coeffs - val0)
        dist1 = np.abs(coeffs - val1)
        
        # ถ้าพิกเซลอยู่ใกล้ Quantizer ของบิต 1 มากกว่า ให้ถอดรหัสเป็น 1 ถ้าไม่ใช่เป็น 0
        bits = np.where(dist1 < dist0, 1, 0).astype(np.uint8)
        return bits