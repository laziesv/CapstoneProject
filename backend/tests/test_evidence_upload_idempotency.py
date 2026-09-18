"""กันอัปโหลดหลักฐานซ้ำด้วย request_id

ธุรกรรมบนบล็อกเชนย้อนกลับไม่ได้ การกดส่งซ้ำหลังเน็ตหลุดจึงต้องไม่สร้าง
หลักฐานใบใหม่ เทสต์ชุดนี้คุมว่าเส้นทาง "ส่งซ้ำ" ไม่แตะทั้งดิสก์ ลายน้ำ และเชน
"""

import sys
from types import ModuleType, SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from uuid import UUID, uuid4


cv2_stub = ModuleType("cv2")
cv2_stub.IMREAD_COLOR = 1
cv2_stub.COLOR_BGR2YCrCb = 2
cv2_stub.COLOR_YCrCb2BGR = 3
cv2_stub.INTER_CUBIC = 4
cv2_stub.imread = Mock()
cv2_stub.resize = Mock()
cv2_stub.cvtColor = Mock()
cv2_stub.split = Mock()
cv2_stub.merge = Mock()
cv2_stub.imwrite = Mock()
sys.modules.setdefault("cv2", cv2_stub)

watermark_stub = ModuleType("app.watermark.mainyy")
watermark_stub.DigitalWatermarkingSystem = Mock
sys.modules.setdefault("app.watermark.mainyy", watermark_stub)

from app.models.enums import BlockchainAction  # noqa: E402
from app.services.evidence_service import (  # noqa: E402
    EvidenceBlockchainWriteError,
    EvidenceService,
    EvidenceUploadRequestConflictError,
)


REQUEST_ID = UUID("33333333-3333-4333-8333-333333333333")
UPLOADER = UUID("22222222-2222-4222-8222-222222222222")
EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
TX_HASH = "0x" + "a" * 64
CONTRACT = "0x" + "1" * 40


def _existing_evidence(uploaded_by=UPLOADER):
    return SimpleNamespace(
        evidence_id=EVIDENCE_ID,
        uploaded_by=uploaded_by,
        upload_request_id=REQUEST_ID,
    )


def _registration():
    return SimpleNamespace(
        tx_hash=TX_HASH,
        block_number=7_100,
        contract_address=CONTRACT,
        action_type=BlockchainAction.REGISTER,
    )


def _upload_payload(request_id=REQUEST_ID):
    return SimpleNamespace(
        case_id=uuid4(),
        description=None,
        captured_at=None,
        request_id=request_id,
    )


class UploadIdempotencyTests(TestCase):
    def test_repeated_request_id_returns_the_first_result_without_touching_chain(
        self,
    ) -> None:
        db = Mock()
        blockchain = Mock()

        with (
            patch(
                "app.services.evidence_service.EvidenceRepository."
                "get_by_upload_request_id",
                return_value=_existing_evidence(),
            ),
            patch(
                "app.services.evidence_service.BlockchainTransactionRepository."
                "get_by_evidence_and_action",
                return_value=[_registration()],
            ),
            patch("app.services.evidence_service.derive_evidence_ref",
                  return_value="0x" + "b" * 64) as derive,
            patch("builtins.open") as opened,
        ):
            result = EvidenceService.upload(
                db,
                _upload_payload(),
                Mock(filename="scene.jpg"),
                uploaded_by=UPLOADER,
                blockchain_service=blockchain,
            )

        # ไม่เขียนไฟล์ ไม่ยิงเชน ไม่แตะฐานข้อมูล
        opened.assert_not_called()
        blockchain.record_evidence.assert_not_called()
        db.commit.assert_not_called()

        derive.assert_called_once_with(EVIDENCE_ID)
        self.assertEqual(result.tx_hash, TX_HASH)
        self.assertEqual(result.block_number, 7_100)
        self.assertEqual(result.contract_address, CONTRACT)

    def test_request_id_from_another_uploader_is_rejected(self) -> None:
        """ไม่คืนหลักฐานของคนอื่นให้ แม้จะส่ง request_id ตรงกัน"""

        db = Mock()

        with patch(
            "app.services.evidence_service.EvidenceRepository."
            "get_by_upload_request_id",
            return_value=_existing_evidence(uploaded_by=uuid4()),
        ):
            with self.assertRaises(EvidenceUploadRequestConflictError):
                EvidenceService.upload(
                    db,
                    _upload_payload(),
                    Mock(filename="scene.jpg"),
                    uploaded_by=UPLOADER,
                    blockchain_service=Mock(),
                )

    def test_missing_registration_transaction_is_reported_not_guessed(self) -> None:
        """หลักฐานมีแต่ธุรกรรมหาย = ข้อมูลไม่ครบคู่ ห้ามเดาค่าคืนไป"""

        db = Mock()

        with (
            patch(
                "app.services.evidence_service.EvidenceRepository."
                "get_by_upload_request_id",
                return_value=_existing_evidence(),
            ),
            patch(
                "app.services.evidence_service.BlockchainTransactionRepository."
                "get_by_evidence_and_action",
                return_value=[],
            ),
        ):
            with self.assertRaises(EvidenceBlockchainWriteError):
                EvidenceService.upload(
                    db,
                    _upload_payload(),
                    Mock(filename="scene.jpg"),
                    uploaded_by=UPLOADER,
                    blockchain_service=Mock(),
                )

    def test_upload_without_request_id_keeps_the_previous_behaviour(self) -> None:
        """ผู้เรียกที่ไม่ส่ง request_id ต้องไม่ถูกเปลี่ยนพฤติกรรม —
        ต้องไม่ไปค้นตารางด้วยค่า None ซึ่งจะจับคู่แถวเก่าที่ยังว่างอยู่"""

        db = Mock()

        with (
            patch(
                "app.services.evidence_service.EvidenceRepository."
                "get_by_upload_request_id",
            ) as lookup,
            patch("app.services.evidence_service.os.makedirs"),
            patch("builtins.open", side_effect=OSError("stop here")),
        ):
            with self.assertRaises(OSError):
                EvidenceService.upload(
                    db,
                    _upload_payload(request_id=None),
                    Mock(filename="scene.jpg"),
                    uploaded_by=UPLOADER,
                    blockchain_service=Mock(),
                )

        lookup.assert_not_called()


if __name__ == "__main__":
    import unittest

    unittest.main()
