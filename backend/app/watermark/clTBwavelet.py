import numpy as np
import cv2
import math
import pywt

class clTBwavelet:

    # --- Extraction and Insertion Helpers ---
    @staticmethod
    def extract_all_bands(coeffs, levels):
        bands = {}
        for level in range(1, levels + 1):
            bands[f"LL{level}"] = clTBwavelet.get_subband(coeffs, "LL", level)
            bands[f"HL{level}"] = clTBwavelet.get_subband(coeffs, "HL", level)
            bands[f"LH{level}"] = clTBwavelet.get_subband(coeffs, "LH", level)
            bands[f"HH{level}"] = clTBwavelet.get_subband(coeffs, "HH", level)
        return bands

    @staticmethod
    def insert_all_bands(coeffs, bands, levels):
        for level in range(1, levels + 1):
            clTBwavelet.set_subband(coeffs, bands[f"LL{level}"], "LL", level)
            clTBwavelet.set_subband(coeffs, bands[f"HL{level}"], "HL", level)
            clTBwavelet.set_subband(coeffs, bands[f"LH{level}"], "LH", level)
            clTBwavelet.set_subband(coeffs, bands[f"HH{level}"], "HH", level)

    @staticmethod
    def get_subband(coeffs, band, level):
        rows, cols = coeffs.shape
        
        # size of subband at this level
        size_row = rows // (2 ** level)
        size_col = cols // (2 ** level)

        # offsets
        band = band.upper()
        if band == "LL":
            row_offset, col_offset = 0, 0
        elif band == "HL":
            row_offset, col_offset = 0, size_col
        elif band == "LH":
            row_offset, col_offset = size_row, 0
        elif band == "HH":
            row_offset, col_offset = size_row, size_col
        else:
            raise ValueError("Band must be LL, HL, LH, or HH")

        # Numpy slicing makes extraction very easy (returns a copy to match C# behavior)
        return coeffs[row_offset:row_offset + size_row, col_offset:col_offset + size_col].copy()

    @staticmethod
    def set_subband(coeffs, subband, band, level):
        rows, cols = coeffs.shape
        
        size_row = rows // (2 ** level)
        size_col = cols // (2 ** level)

        band = band.upper()
        if band == "LL":
            row_offset, col_offset = 0, 0
        elif band == "HL":
            row_offset, col_offset = 0, size_col
        elif band == "LH":
            row_offset, col_offset = size_row, 0
        elif band == "HH":
            row_offset, col_offset = size_row, size_col
        else:
            raise ValueError("Band must be LL, HL, LH, or HH")

        # Numpy slicing makes assignment very easy
        coeffs[row_offset:row_offset + size_row, col_offset:col_offset + size_col] = subband

    @staticmethod
    def level_to_min_size(image_size, levels):
        return image_size // (2 ** levels)

    @staticmethod
    def min_size_to_level(image_size, min_size):
        return int(math.log(image_size / min_size, 2))


    # --- Transformation Helpers ---
    @staticmethod
    def dwt(image, level=3):
        """
        Mimics the single-array (Mallat layout) in-place DWT behavior of TurboWavelets
        """
        # Ensure image is float32
        fdwt = np.copy(image).astype(np.float32)
        
        for i in range(1, level + 1):
            # Extract the LL part of the previous level (or whole image for level 1)
            size_r = fdwt.shape[0] // (2 ** (i - 1))
            size_c = fdwt.shape[1] // (2 ** (i - 1))
            ll_prev = fdwt[0:size_r, 0:size_c]
            
            # Apply 2D Haar Wavelet transform (pywt returns: LL, (HL, LH, HH))
            LL, (HL, LH, HH) = pywt.dwt2(ll_prev, 'haar')
            
            # Pack back into the single array layout
            clTBwavelet.set_subband(fdwt, LL, "LL", i)
            clTBwavelet.set_subband(fdwt, HL, "HL", i)
            clTBwavelet.set_subband(fdwt, LH, "LH", i)
            clTBwavelet.set_subband(fdwt, HH, "HH", i)
            
        return fdwt

    @staticmethod
    def inverse_dwt(coeffs, level=3):
        """
        Mimics the single-array (Mallat layout) in-place Inverse DWT behavior
        """
        bdwt = np.copy(coeffs).astype(np.float32)
        
        # Iterate backwards from max level down to 1
        for i in range(level, 0, -1):
            LL = clTBwavelet.get_subband(bdwt, "LL", i)
            HL = clTBwavelet.get_subband(bdwt, "HL", i)
            LH = clTBwavelet.get_subband(bdwt, "LH", i)
            HH = clTBwavelet.get_subband(bdwt, "HH", i)
            
            # Perform Inverse 2D Haar Wavelet transform
            ll_recon = pywt.idwt2((LL, (HL, LH, HH)), 'haar')
            
            # Place the reconstructed LL component back to the higher level's slot
            size_r = bdwt.shape[0] // (2 ** (i - 1))
            size_c = bdwt.shape[1] // (2 ** (i - 1))
            bdwt[0:size_r, 0:size_c] = ll_recon
            
        return bdwt


    # --- Conversion Helpers ---
    @staticmethod
    def mat_to_array(src):
        """
        In Python, an OpenCV Mat is just a Numpy Array. 
        We just need to ensure it's a 32-bit float array.
        """
        return np.float32(src)

    @staticmethod
    def array_to_mat(M):
        """
        Similarly, returning it as a float32 numpy array is all that OpenCV needs.
        """
        return np.float32(M)

    @staticmethod
    def to_display_8u(f32, normalized):
        if normalized:
            # Normalize to 0-255
            show = cv2.normalize(f32, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
            # Convert to uint8
            show = cv2.convertScaleAbs(show)
        else:
            show = cv2.convertScaleAbs(f32)
            
        return show
