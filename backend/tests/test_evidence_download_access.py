import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import ANY, MagicMock, patch
from uuid import UUID, uuid4

from fastapi import HTTPException
from blockchain_client import AccessAction, derive_access_session_ref

from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction, AuditResult, BlockchainAction
from app.repositories.access_log_repository import AccessLogRepository
from app.services.evidence_access_service import EvidenceAccessService


class EvidenceDownloadAccessTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.case = SimpleNamespace(
            case_id=uuid4(),
            created_by=self.user.user_id,
            assigned_officer=None,
        )
        self.file = SimpleNamespace(file_path="watermarked.png")
        self.original_file = SimpleNamespace(
            file_path="original.png",
            file_hash="ab" * 32,
        )
        self.evidence = SimpleNamespace(
            evidence_id=uuid4(),
            evidence_number="EV-TEST",
            case_id=self.case.case_id,
            original_filename="evidence.png",
            original_file=self.original_file,
            watermarked_file=self.file,
        )
        self.access_log = SimpleNamespace(log_id=uuid4(), tx_internal_id=None)
        self.transaction = SimpleNamespace(tx_internal_id=uuid4())
        self.blockchain = MagicMock()
        self.blockchain.record_access.return_value = {
            "tx_hash": "0x" + "1" * 64,
            "block_number": 7000,
            "contract_address": "0x" + "2" * 40,
        }
        self.watermark = MagicMock()
        self.watermark.create_personalized_copy.return_value = SimpleNamespace(
            file_path="personalized.png",
            file_hash="cd" * 32,
        )
        self.integrity = MagicMock()
        self.integrity.verify.return_value = SimpleNamespace(
            verified=True,
            status="VERIFIED",
        )

    def prepare(self):
        with (
            patch(
                "app.services.evidence_access_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_access_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_access_service.can_access_case",
                return_value=True,
            ),
            patch(
                "app.services.evidence_access_service.os.path.isfile",
                return_value=True,
            ),
            patch(
                "app.services.evidence_access_service.AccessLogRepository.stage_download",
                return_value=self.access_log,
            ) as stage_log,
            patch(
                "app.services.evidence_access_service.BlockchainTransactionRepository.stage_access",
                return_value=self.transaction,
            ) as stage_transaction,
        ):
            self.stage_log = stage_log
            self.stage_transaction = stage_transaction
            result = EvidenceAccessService.prepare_download(
                self.db,
                evidence_id=self.evidence.evidence_id,
                current_user=self.user,
                ip_address="127.0.0.1",
                user_agent="test-agent",
                blockchain_service=self.blockchain,
                watermark_service=self.watermark,
                integrity_service=self.integrity,
            )
        return result, stage_log, stage_transaction

    def test_success_stages_one_log_one_chain_call_and_one_transaction(self):
        result, stage_log, stage_transaction = self.prepare()

        stage_log.assert_called_once_with(
            self.db,
            user_id=self.user.user_id,
            evidence_id=self.evidence.evidence_id,
            ip_address="127.0.0.1",
            user_agent="test-agent",
            case_id=self.evidence.case_id,
            accessed_at=ANY,
        )
        accessed_at = stage_log.call_args.kwargs["accessed_at"]
        self.blockchain.record_access.assert_called_once_with(
            evidence_id=self.evidence.evidence_id,
            officer_user_id=self.user.user_id,
            access_log_id=self.access_log.log_id,
            action=AccessAction.DOWNLOAD,
            occurred_at=int(accessed_at.timestamp()),
        )
        stage_transaction.assert_called_once_with(
            self.db,
            tx_hash="0x" + "1" * 64,
            evidence_id=self.evidence.evidence_id,
            initiated_by=self.user.user_id,
            block_number=7000,
            contract_address="0x" + "2" * 40,
        )
        self.assertEqual(self.access_log.tx_internal_id, self.transaction.tx_internal_id)
        self.db.commit.assert_called_once_with()
        self.assertEqual(result.file_path, "personalized.png")
        self.assertNotEqual(result.file_path, self.original_file.file_path)
        self.assertNotEqual(result.file_path, self.file.file_path)
        self.assertEqual(result.evidence_id, self.evidence.evidence_id)
        self.assertEqual(
            result.access_session_ref,
            derive_access_session_ref(self.access_log.log_id),
        )
        self.assertEqual(result.action, "DOWNLOAD")
        self.assertEqual(result.tx_hash, "0x" + "1" * 64)
        self.assertEqual(result.block_number, 7000)
        self.assertEqual(result.integrity_status, "VERIFIED")
        self.integrity.verify.assert_called_once_with(
            evidence_id=self.evidence.evidence_id,
            original_file_path=self.original_file.file_path,
            database_hash=self.original_file.file_hash,
        )

    def test_authorization_happens_before_staging_or_chain_write(self):
        with (
            patch(
                "app.services.evidence_access_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_access_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_access_service.can_access_case",
                return_value=False,
            ),
            patch(
                "app.services.evidence_access_service.AccessLogRepository.stage_download"
            ) as stage_log,
            patch(
                "app.services.evidence_access_service.BlockchainTransactionRepository.stage_access"
            ) as stage_transaction,
        ):
            with self.assertRaises(HTTPException) as raised:
                EvidenceAccessService.prepare_download(
                    self.db,
                    evidence_id=self.evidence.evidence_id,
                    current_user=self.user,
                    ip_address=None,
                    user_agent=None,
                    blockchain_service=self.blockchain,
                    watermark_service=self.watermark,
                )

        self.assertEqual(raised.exception.status_code, 404)
        stage_log.assert_not_called()
        self.blockchain.record_access.assert_not_called()
        stage_transaction.assert_not_called()

    def test_missing_watermarked_file_does_not_write_chain(self):
        self.evidence.watermarked_file = None
        with (
            patch(
                "app.services.evidence_access_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_access_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_access_service.can_access_case",
                return_value=True,
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                EvidenceAccessService.prepare_download(
                    self.db,
                    evidence_id=self.evidence.evidence_id,
                    current_user=self.user,
                    ip_address=None,
                    user_agent=None,
                    blockchain_service=self.blockchain,
                    watermark_service=self.watermark,
                )
        self.assertEqual(raised.exception.status_code, 404)
        self.blockchain.record_access.assert_not_called()

    def test_missing_physical_file_does_not_stage_or_write_chain(self):
        with (
            patch(
                "app.services.evidence_access_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_access_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_access_service.can_access_case",
                return_value=True,
            ),
            patch(
                "app.services.evidence_access_service.os.path.isfile",
                return_value=False,
            ),
            patch(
                "app.services.evidence_access_service.AccessLogRepository.stage_download"
            ) as stage_log,
        ):
            with self.assertRaises(HTTPException) as raised:
                EvidenceAccessService.prepare_download(
                    self.db,
                    evidence_id=self.evidence.evidence_id,
                    current_user=self.user,
                    ip_address=None,
                    user_agent=None,
                    blockchain_service=self.blockchain,
                    watermark_service=self.watermark,
                )
        self.assertEqual(raised.exception.status_code, 404)
        stage_log.assert_not_called()
        self.blockchain.record_access.assert_not_called()

    def test_blockchain_failure_rolls_back_and_does_not_commit(self):
        self.blockchain.record_access.side_effect = RuntimeError("chain failed")
        with self.assertRaises(HTTPException) as raised:
            self.prepare()
        self.assertEqual(raised.exception.status_code, 503)
        self.blockchain.record_access.assert_called_once()
        self.db.rollback.assert_called_once_with()
        self.db.commit.assert_not_called()

    def test_changed_original_file_blocks_before_any_download_write(self):
        self.integrity.verify.return_value = SimpleNamespace(
            verified=False,
            status="ORIGINAL_FILE_MISMATCH",
        )

        with self.assertRaises(HTTPException) as raised:
            self.prepare()

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail["code"],
            "EVIDENCE_INTEGRITY_MISMATCH",
        )
        self.assertEqual(
            raised.exception.detail["mismatch_type"],
            "ORIGINAL_FILE_MISMATCH",
        )
        self.stage_log.assert_not_called()
        self.watermark.create_personalized_copy.assert_not_called()
        self.blockchain.record_access.assert_not_called()
        self.stage_transaction.assert_not_called()
        self.db.commit.assert_not_called()

    def test_changed_database_hash_blocks_before_personalization(self):
        self.integrity.verify.return_value = SimpleNamespace(
            verified=False,
            status="DATABASE_HASH_MISMATCH",
        )

        with self.assertRaises(HTTPException) as raised:
            self.prepare()

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail,
            {
                "code": "EVIDENCE_INTEGRITY_MISMATCH",
                "mismatch_type": "DATABASE_HASH_MISMATCH",
                "message": "ค่าแฮชไฟล์ต้นฉบับในฐานข้อมูลไม่ตรงกับ Blockchain",
            },
        )
        self.stage_log.assert_not_called()
        self.watermark.create_personalized_copy.assert_not_called()
        self.blockchain.record_access.assert_not_called()
        self.stage_transaction.assert_not_called()
        self.db.commit.assert_not_called()

    def test_original_and_database_mismatch_returns_combined_reason(self):
        self.integrity.verify.return_value = SimpleNamespace(
            verified=False,
            status="ORIGINAL_AND_DATABASE_HASH_MISMATCH",
        )

        with self.assertRaises(HTTPException) as raised:
            self.prepare()

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail["mismatch_type"],
            "ORIGINAL_AND_DATABASE_HASH_MISMATCH",
        )
        self.assertIn(
            "ไฟล์ต้นฉบับปัจจุบันและค่าแฮชในฐานข้อมูล",
            raised.exception.detail["message"],
        )
        self.stage_log.assert_not_called()
        self.watermark.create_personalized_copy.assert_not_called()
        self.blockchain.record_access.assert_not_called()
        self.stage_transaction.assert_not_called()

    def test_integrity_read_failure_keeps_503_and_creates_no_custody_write(self):
        self.integrity.verify.side_effect = RuntimeError("rpc unavailable")

        with self.assertRaises(HTTPException) as raised:
            self.prepare()

        self.assertEqual(raised.exception.status_code, 503)
        self.stage_log.assert_not_called()
        self.watermark.create_personalized_copy.assert_not_called()
        self.blockchain.record_access.assert_not_called()
        self.stage_transaction.assert_not_called()
        self.db.commit.assert_not_called()

    def test_commit_failure_after_chain_success_does_not_retry(self):
        self.db.commit.side_effect = RuntimeError("commit failed")
        with self.assertRaises(HTTPException) as raised:
            self.prepare()
        self.assertEqual(raised.exception.status_code, 503)
        self.blockchain.record_access.assert_called_once()
        self.db.rollback.assert_called_once_with()

    def test_access_log_repository_stages_download_with_uuid_and_local_metadata(self):
        log = AccessLogRepository.stage_download(
            self.db,
            user_id=self.user.user_id,
            evidence_id=self.evidence.evidence_id,
            ip_address="192.0.2.1",
            user_agent="browser-agent",
            accessed_at=datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc),
        )
        self.assertIsInstance(log.log_id, UUID)
        self.assertEqual(log.action, AuditAction.DOWNLOAD)
        self.assertEqual(log.result, AuditResult.SUCCESS)
        self.assertEqual(log.user_id, self.user.user_id)
        self.assertEqual(log.evidence_id, self.evidence.evidence_id)
        self.assertIsNone(log.case_id)
        self.assertEqual(log.ip_address, "192.0.2.1")
        self.assertEqual(log.user_agent, "browser-agent")
        self.assertIsNone(log.tx_internal_id)
        self.db.add.assert_called_once_with(log)
        self.db.flush.assert_called_once_with()
        self.db.commit.assert_not_called()

    def test_transaction_repository_stages_confirmed_access_metadata(self):
        transaction = BlockchainTransactionRepository.stage_access(
            self.db,
            tx_hash="0x" + "1" * 64,
            evidence_id=self.evidence.evidence_id,
            initiated_by=self.user.user_id,
            block_number=7000,
            contract_address="0x" + "2" * 40,
        )
        self.assertEqual(transaction.action_type, BlockchainAction.ACCESS)
        self.assertEqual(transaction.status, "confirmed")
        self.assertEqual(transaction.evidence_id, self.evidence.evidence_id)
        self.assertEqual(transaction.initiated_by, self.user.user_id)
        self.assertEqual(transaction.block_number, 7000)
        self.assertIsNone(transaction.input_data_hash)
        self.assertIsNone(transaction.gas_used)
        self.assertIsNone(transaction.block_timestamp)
        self.db.add.assert_called_once_with(transaction)
        self.db.flush.assert_called_once_with()
        self.db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
