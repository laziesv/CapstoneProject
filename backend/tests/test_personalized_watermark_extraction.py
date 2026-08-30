import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

import numpy as np

from app.services import personalized_watermark_service as watermark_module
from app.services.personalized_watermark_service import (
    PersonalizedWatermarkExtractionError,
    PersonalizedWatermarkService,
)


# ใช้ codec instance ที่ service โหลดไว้เพื่อไม่รับ cv2 stub จาก test module อื่น
cv2 = watermark_module.cv2
DigitalWatermarkingSystem = watermark_module.DigitalWatermarkingSystem


class PersonalizedWatermarkExtractionTests(unittest.TestCase):
    ACCESS_SESSION_REF = "0x" + "34" * 32

    @staticmethod
    def _textured_image() -> np.ndarray:
        rng = np.random.default_rng(20260818)
        return rng.integers(32, 224, (1024, 1024, 3), dtype=np.uint8)

    @staticmethod
    def _low_texture_image() -> np.ndarray:
        gradient = np.linspace(0, 255, 1024, dtype=np.uint8)
        x_channel, y_channel = np.meshgrid(gradient, gradient)
        average = (
            (x_channel.astype(np.uint16) + y_channel.astype(np.uint16)) // 2
        ).astype(np.uint8)
        image = cv2.merge([x_channel, y_channel, average])
        cv2.circle(image, (512, 512), 260, (220, 40, 160), -1)
        cv2.rectangle(image, (100, 120), (410, 360), (20, 210, 80), -1)
        return image

    def _round_trip(
        self,
        suffix: str,
        source_size: tuple[int, int] = (1024, 1024),
    ) -> str:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            original_path = base / f"original{suffix}"
            owned_root = base / "owned"
            params = (
                [cv2.IMWRITE_JPEG_QUALITY, 95]
                if suffix == ".jpg"
                else []
            )
            source = self._textured_image()
            if source_size != (1024, 1024):
                source = cv2.resize(source, source_size)
            self.assertTrue(
                cv2.imwrite(
                    str(original_path),
                    source,
                    params,
                )
            )

            with patch.object(
                watermark_module,
                "PERSONALIZED_TEMP_ROOT",
                owned_root,
            ):
                service = PersonalizedWatermarkService()
                result = service.create_personalized_copy(
                    original_path=str(original_path),
                    evidence_id=UUID(
                        "11111111-2222-3333-4444-555555555555"
                    ),
                    access_session_ref=self.ACCESS_SESSION_REF,
                )
                return service.extract_access_session_ref(
                    personalized_path=result.file_path,
                    original_path=str(original_path),
                )

    def test_real_codec_recovers_unknown_session_ref_from_png(self):
        self.assertEqual(self._round_trip(".png"), self.ACCESS_SESSION_REF)

    def test_real_codec_recovers_unknown_session_ref_from_jpeg_quality_95(self):
        self.assertEqual(self._round_trip(".jpg"), self.ACCESS_SESSION_REF)

    def test_real_codec_normalizes_non_target_source_before_extraction(self):
        self.assertEqual(
            self._round_trip(".png", source_size=(1080, 1080)),
            self.ACCESS_SESSION_REF,
        )

    def test_malformed_and_empty_decoded_payloads_raise_controlled_error(self):
        malformed_values = (
            "",
            "34" * 32,
            "0x" + "34" * 31,
            "0x" + "zz" * 32,
        )
        with tempfile.TemporaryDirectory() as directory:
            personalized = Path(directory) / "personalized.png"
            original = Path(directory) / "original.png"
            image = np.full((32, 32, 3), 120, dtype=np.uint8)
            self.assertTrue(cv2.imwrite(str(personalized), image))
            self.assertTrue(cv2.imwrite(str(original), image))

            for recovered in malformed_values:
                with self.subTest(recovered=recovered):
                    with (
                        patch.object(
                            watermark_module.DigitalWatermarkingSystem,
                            "extract",
                            return_value=(image[:, :, 0], image[:, :, 0]),
                        ),
                        patch.object(
                            watermark_module.clQRcodec,
                            "decodeQR",
                            return_value=recovered,
                        ),
                    ):
                        with self.assertRaises(
                            PersonalizedWatermarkExtractionError
                        ):
                            PersonalizedWatermarkService().extract_access_session_ref(
                                personalized_path=str(personalized),
                                original_path=str(original),
                            )

    def test_legacy_dynamic_hash_does_not_change_extracted_pixels(self):
        original = cv2.split(
            cv2.cvtColor(self._textured_image(), cv2.COLOR_BGR2YCrCb)
        )[0]
        system = DigitalWatermarkingSystem()
        personalized = system.embed(
            original,
            static_data="synthetic-evidence",
            dynamic_hash=self.ACCESS_SESSION_REF,
        )

        without_hash = system.extract(personalized, original)
        with_legacy_hash = system.extract(
            personalized,
            original,
            dynamic_hash="legacy-value",
        )

        np.testing.assert_array_equal(without_hash[0], with_legacy_hash[0])
        np.testing.assert_array_equal(without_hash[1], with_legacy_hash[1])

    def test_low_texture_image_raises_controlled_extraction_error(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            original_path = base / "original.png"
            owned_root = base / "owned"
            self.assertTrue(
                cv2.imwrite(str(original_path), self._low_texture_image())
            )

            with patch.object(
                watermark_module,
                "PERSONALIZED_TEMP_ROOT",
                owned_root,
            ):
                service = PersonalizedWatermarkService()
                result = service.create_personalized_copy(
                    original_path=str(original_path),
                    evidence_id=UUID(
                        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                    ),
                    access_session_ref=self.ACCESS_SESSION_REF,
                )
                with self.assertRaises(PersonalizedWatermarkExtractionError):
                    service.extract_access_session_ref(
                        personalized_path=result.file_path,
                        original_path=str(original_path),
                    )


if __name__ == "__main__":
    unittest.main()
