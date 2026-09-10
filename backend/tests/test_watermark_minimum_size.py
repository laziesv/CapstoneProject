"""กันภาพที่เล็กเกินกว่าจะฝังลายน้ำแล้วตรวจสอบย้อนกลับได้

ภาพเล็กทำให้ซับแบนด์ของ DWT เล็กตาม จน QR ของแฮชถูกบีบจนถอดกลับไม่ได้
โดยที่ขั้นตอนการฝังไม่ได้แจ้งข้อผิดพลาดใด ๆ ระบบจึงเคยรับหลักฐานที่
"มีลายน้ำ" แต่ตรวจสอบไม่ได้ตลอดไป เทสต์ชุดนี้ล็อกพฤติกรรมใหม่ที่ปฏิเสธตั้งแต่ต้นทาง
"""

import sys
from types import ModuleType
from unittest import TestCase
from unittest.mock import Mock

# cv2 ของจริงไม่จำเป็นสำหรับเทสต์ชุดนี้ และทำให้ import ช้า
if "cv2" not in sys.modules:
    cv2_stub = ModuleType("cv2")
    cv2_stub.IMREAD_COLOR = 1
    cv2_stub.COLOR_BGR2YCrCb = 2
    cv2_stub.COLOR_YCrCb2BGR = 3
    cv2_stub.imread = Mock()
    cv2_stub.cvtColor = Mock()
    cv2_stub.split = Mock()
    cv2_stub.merge = Mock()
    cv2_stub.imwrite = Mock()
    sys.modules["cv2"] = cv2_stub

from app.services.watermark_constraints import (  # noqa: E402
    MIN_BAND_PX,
    WATERMARK_LEVEL,
    is_watermarkable,
    min_source_side,
)


class WatermarkConstraintsTests(TestCase):
    def test_level_constant_matches_the_real_watermarking_system(self) -> None:
        """ถ้ามีคนปรับ level ของตัวฝังลายน้ำ ขนาดขั้นต่ำต้องถูกปรับตาม

        เทสต์นี้คือจุดที่จะดังขึ้นก่อน ไม่ใช่ปล่อยให้หลุดไปเป็นหลักฐาน
        ที่ตรวจสอบไม่ได้ในภายหลัง

        อ่านค่าจากซอร์สด้วย ast แทนการ import คลาสมาสร้าง object เพราะเทสต์
        ชุดอื่นในโปรเจกต์ stub โมดูล mainyy ไว้ การ import จึงอาจได้ Mock
        การอ่านไฟล์บนดิสก์ทำให้ผลไม่ขึ้นกับลำดับการรันเทสต์
        """
        import ast
        import os

        source_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "watermark", "mainyy.py"
        )
        with open(source_path, encoding="utf-8") as source_file:
            tree = ast.parse(source_file.read())

        defaults = {
            argument.arg: default
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
            and node.name == "DigitalWatermarkingSystem"
            for item in node.body
            if isinstance(item, ast.FunctionDef) and item.name == "__init__"
            for argument, default in zip(
                item.args.args[-len(item.args.defaults):], item.args.defaults
            )
        }

        self.assertIn("level", defaults, "ไม่พบพารามิเตอร์ level ใน __init__")
        self.assertEqual(WATERMARK_LEVEL, ast.literal_eval(defaults["level"]))

    def test_minimum_side_follows_the_subband_requirement(self) -> None:
        # ROI ถูกปัดลงเป็นพหุคูณของ 2**level ขนาดขั้นต่ำจึงเป็นผลคูณตรง ๆ
        self.assertEqual(min_source_side(), MIN_BAND_PX * (2 ** WATERMARK_LEVEL))
        self.assertEqual(min_source_side(level=2), MIN_BAND_PX * 4)
        self.assertEqual(min_source_side(level=3), MIN_BAND_PX * 8)

    def test_image_at_the_threshold_is_accepted(self) -> None:
        side = min_source_side()
        self.assertTrue(is_watermarkable(side, side))
        self.assertTrue(is_watermarkable(side, side * 3))

    def test_image_one_pixel_below_the_threshold_is_rejected(self) -> None:
        side = min_source_side()
        self.assertFalse(is_watermarkable(side - 1, side))
        self.assertFalse(is_watermarkable(side, side - 1))

    def test_shorter_side_is_what_matters_not_the_area(self) -> None:
        """ภาพยาวมากแต่แคบมีพื้นที่เยอะ แต่ ROI ถูกจำกัดด้วยด้านสั้นเสมอ"""
        side = min_source_side()
        self.assertFalse(is_watermarkable(100, side * 50))


class UploadRejectsSmallImageTests(TestCase):
    def test_upload_raises_before_writing_the_watermarked_file(self) -> None:
        """ต้องหยุดก่อนเขียนไฟล์ลายน้ำและก่อนแตะ Blockchain

        ถ้าปล่อยให้ไปถึงขั้นบันทึกเชน จะได้ธุรกรรมที่ย้อนกลับไม่ได้
        ผูกกับหลักฐานที่ตรวจสอบไม่ได้
        """
        from unittest.mock import mock_open, patch

        from app.services.evidence_service import (
            EvidenceImageTooSmallError,
            EvidenceService,
        )

        too_small = min_source_side() - 1
        image = Mock(shape=(too_small, too_small, 3))
        db = Mock()
        upload_file = Mock(filename="tiny.jpg")
        blockchain_service = Mock()

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch("app.services.evidence_service.os.path.exists", return_value=False),
            patch("app.services.evidence_service.os.remove"),
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                return_value="a" * 64,
            ),
            patch("app.services.evidence_service.os.path.getsize", return_value=100),
            patch("app.services.evidence_service.EvidenceRepository.create"),
            patch("app.services.evidence_service.EvidenceFileRepository.create"),
            patch("app.services.evidence_service.cv2.imread", return_value=image),
            patch("app.services.evidence_service.cv2.imwrite") as imwrite,
        ):
            with self.assertRaises(EvidenceImageTooSmallError) as raised:
                EvidenceService.upload(
                    db,
                    Mock(case_id=None, description=None, captured_at=None),
                    upload_file,
                    uploaded_by=None,
                    blockchain_service=blockchain_service,
                )

        imwrite.assert_not_called()
        blockchain_service.record_evidence.assert_not_called()
        db.rollback.assert_called_once()

        error = raised.exception
        self.assertEqual(error.width, too_small)
        self.assertEqual(error.height, too_small)
        self.assertEqual(error.minimum_side, min_source_side())


class UploadRouteReportsTooSmallImageTests(TestCase):
    """ล็อกสัญญาที่ frontend ใช้แสดงข้อความให้ผู้ใช้

    ถ้าเปลี่ยน status code หรือ key ใน detail ต้องแก้ฝั่งหน้าเว็บด้วย
    """

    def test_route_translates_the_error_into_422_with_the_required_size(self) -> None:
        import json
        import uuid
        from unittest.mock import patch

        from fastapi import HTTPException

        from app.routes.evidence_items import upload
        from app.services.evidence_service import EvidenceImageTooSmallError

        minimum = min_source_side()
        with patch(
            "app.routes.evidence_items.EvidenceService.upload",
            side_effect=EvidenceImageTooSmallError(
                width=260, height=320, minimum_side=minimum
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                upload(
                    evidence=json.dumps({"case_id": str(uuid.uuid4())}),
                    file=Mock(filename="tiny.jpg"),
                    db=Mock(),
                    current_user=Mock(),
                )

        error = raised.exception
        self.assertEqual(error.status_code, 422)
        self.assertEqual(error.detail["code"], "IMAGE_TOO_SMALL_FOR_WATERMARK")
        self.assertEqual(error.detail["minimum_side"], minimum)
        self.assertEqual(error.detail["width"], 260)
        self.assertEqual(error.detail["height"], 320)
        # ข้อความต้องบอกตัวเลขที่ผู้ใช้ต้องทำตาม ไม่ใช่แค่ว่า "ไม่ผ่าน"
        self.assertIn(str(minimum), error.detail["message"])
