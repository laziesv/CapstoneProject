import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from uuid import uuid4

from blockchain_client import derive_evidence_ref

from app.services.original_evidence_integrity_service import (
    OriginalEvidenceBlockchainReadError,
    OriginalEvidenceIntegrityService,
)
from app.utils.hash import calculate_sha256


class OriginalEvidenceIntegrityServiceTests(unittest.TestCase):
    def setUp(self):
        self.evidence_id = uuid4()
        self.blockchain = Mock()
        self.service = OriginalEvidenceIntegrityService(self.blockchain)

    def verify(self, file_bytes: bytes, database_hash: str | None = None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(file_bytes)
        current_hash = calculate_sha256(str(original_path))
        self.blockchain.get_evidence.return_value = {
            "exists": True,
            "evidence_hash": "0x" + current_hash,
        }
        return self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=database_hash or current_hash,
        )

    def test_current_file_database_and_blockchain_hashes_match(self):
        result = self.verify(b"intact synthetic evidence")

        self.assertTrue(result.verified)
        self.assertTrue(result.current_matches_blockchain)
        self.assertTrue(result.database_matches_blockchain)
        self.assertTrue(result.current_matches_database)
        self.assertEqual(result.status, "VERIFIED")
        self.assertEqual(result.mismatches, ())
        self.blockchain.get_evidence.assert_called_once_with(
            derive_evidence_ref(self.evidence_id)
        )

    def test_changed_current_bytes_are_detected_against_blockchain(self):
        original_chain_hash = "ab" * 32
        self.blockchain.get_evidence.return_value = {
            "exists": True,
            "evidence_hash": "0x" + original_chain_hash,
        }

        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(b"changed synthetic evidence")
        result = self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=original_chain_hash,
        )

        self.assertEqual(result.status, "ORIGINAL_FILE_MISMATCH")
        self.assertFalse(result.current_matches_blockchain)
        self.assertTrue(result.database_matches_blockchain)
        self.assertEqual(
            {mismatch.field for mismatch in result.mismatches},
            {"original_file_bytes_hash"},
        )

    def test_changed_database_hash_is_detected_independently(self):
        result = self.verify(
            b"intact synthetic evidence",
            database_hash="cd" * 32,
        )

        self.assertEqual(result.status, "DATABASE_HASH_MISMATCH")
        self.assertTrue(result.current_matches_blockchain)
        self.assertFalse(result.database_matches_blockchain)
        self.assertEqual(
            {mismatch.field for mismatch in result.mismatches},
            {"database_original_hash"},
        )

    def test_changed_file_and_database_hash_report_combined_mismatch(self):
        original_chain_hash = "ab" * 32
        self.blockchain.get_evidence.return_value = {
            "exists": True,
            "evidence_hash": "0x" + original_chain_hash,
        }
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(b"changed synthetic evidence")
        changed_hash = calculate_sha256(str(original_path))

        result = self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=changed_hash,
        )

        self.assertEqual(result.status, "ORIGINAL_AND_DATABASE_HASH_MISMATCH")
        self.assertTrue(result.current_matches_database)
        self.assertEqual(len(result.mismatches), 2)

    def test_each_verification_rehashes_current_file_bytes(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(b"intact synthetic evidence")
        original_hash = calculate_sha256(str(original_path))
        self.blockchain.get_evidence.return_value = {
            "exists": True,
            "evidence_hash": "0x" + original_hash,
        }

        intact = self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=original_hash,
        )
        original_path.write_bytes(b"tampered after first check")
        tampered = self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=original_hash,
        )

        self.assertTrue(intact.verified)
        self.assertEqual(tampered.status, "ORIGINAL_FILE_MISMATCH")
        self.assertNotEqual(intact.current_file_hash, tampered.current_file_hash)

    def test_missing_chain_record_is_not_verified(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(b"synthetic evidence")
        self.blockchain.get_evidence.return_value = {
            "exists": False,
            "evidence_hash": "0x" + "00" * 32,
        }

        result = self.service.verify(
            evidence_id=self.evidence_id,
            original_file_path=str(original_path),
            database_hash=calculate_sha256(str(original_path)),
        )

        self.assertFalse(result.verified)
        self.assertEqual(result.status, "MISSING_ON_CHAIN")

    def test_blockchain_read_failure_remains_meaningful(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        original_path = Path(directory.name) / "original.bin"
        original_path.write_bytes(b"synthetic evidence")
        self.blockchain.get_evidence.side_effect = RuntimeError("rpc unavailable")

        with self.assertRaises(OriginalEvidenceBlockchainReadError):
            self.service.verify(
                evidence_id=self.evidence_id,
                original_file_path=str(original_path),
                database_hash="ab" * 32,
            )


if __name__ == "__main__":
    unittest.main()
