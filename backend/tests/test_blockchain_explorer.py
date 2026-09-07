import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from fastapi import HTTPException

from app.deps import get_admin_user, get_current_user
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.routes.blockchain import block, transaction
from app.schemas.blockchain_explorer import (
    BlockchainAccessSessionResponse,
    BlockchainEvidenceResponse,
)
from app.services.blockchain_explorer_service import (
    BlockchainExplorerNotFoundError,
    BlockchainExplorerService,
    BlockchainExplorerUnavailableError,
)


EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
USER_ID = UUID("22222222-2222-4222-8222-222222222222")
LOG_ID = UUID("33333333-3333-4333-8333-333333333333")
EVIDENCE_REF = derive_evidence_ref(EVIDENCE_ID)
OFFICER_REF = derive_actor_ref(USER_ID)
SESSION_REF = derive_access_session_ref(LOG_ID)


def access_event(block_number, transaction_index, log_index=0):
    return {
        "evidence_ref": EVIDENCE_REF,
        "officer_ref": OFFICER_REF,
        "access_session_ref": SESSION_REF,
        "action": AccessAction.DOWNLOAD,
        "occurred_at": 1_700_000_000 + block_number,
        "recorded_at": 1_700_000_000 + block_number,
        "writer": "0x" + "44" * 20,
        "tx_hash": "0x" + f"{block_number:064x}",
        "block_number": block_number,
        "transaction_index": transaction_index,
        "log_index": log_index,
    }


class BlockchainExplorerServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.chain = Mock()
        self.service = BlockchainExplorerService(self.chain)
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            evidence_number="EV-EXPLORER-1",
        )
        self.user = SimpleNamespace(
            user_id=USER_ID,
            badge_number="B-001",
            username="investigator",
            email="investigator@example.test",
            full_name="Investigator",
            rank="Officer",
        )
        self.chain.get_evidence.return_value = {
            "evidence_hash": "0x" + "aa" * 32,
            "uploader_ref": "0x" + "bb" * 32,
            "recorded_at": 1_700_000_000,
            "writer": "0x" + "44" * 20,
            "exists": True,
        }
        first = access_event(20, 1)
        second = access_event(20, 0, 3)
        self.chain.get_evidence_history_by_ref.return_value = {
            "registration": {
                "tx_hash": "0x" + "cc" * 32,
                "block_number": 19,
                "transaction_index": 0,
                "log_index": 0,
            },
            "access_history": [second, first],
            "scan": {"from_block": 10, "to_block": 20, "chunk_size": 1000},
        }

    def test_evidence_id_derives_ref_and_returns_chain_history(self):
        with (
            patch.object(EvidenceRepository, "get_by_id", return_value=self.evidence),
            patch.object(UserRepository, "list", return_value=[self.user]),
        ):
            result = self.service.evidence_by_id(self.db, EVIDENCE_ID)

        self.chain.get_evidence.assert_called_once_with(EVIDENCE_REF)
        self.chain.get_evidence_history_by_ref.assert_called_once_with(EVIDENCE_REF)
        self.assertEqual(result["evidence_ref"], EVIDENCE_REF)
        self.assertEqual(result["evidence_number"], "EV-EXPLORER-1")
        self.assertEqual([item["transaction_index"] for item in result["access_history"]], [0, 1])
        BlockchainEvidenceResponse(**result)

    def test_evidence_ref_works_without_database_row(self):
        with (
            patch.object(EvidenceRepository, "get_all", return_value=[]),
            patch.object(UserRepository, "list", return_value=[]),
        ):
            result = self.service.evidence_by_ref(self.db, EVIDENCE_REF)

        self.assertIsNone(result["evidence_id"])
        self.assertIsNone(result["evidence_number"])
        self.assertEqual(len(result["access_history"]), 2)

    def test_unknown_evidence_is_not_found(self):
        self.chain.get_evidence.return_value["exists"] = False
        with patch.object(EvidenceRepository, "get_all", return_value=[]):
            with self.assertRaises(BlockchainExplorerNotFoundError):
                self.service.evidence_by_ref(self.db, EVIDENCE_REF)

    def test_access_session_survives_missing_access_log(self):
        self.chain.get_access_by_session.return_value = {
            "evidence_ref": EVIDENCE_REF,
            "officer_ref": OFFICER_REF,
            "action": AccessAction.DOWNLOAD,
            "occurred_at": 1_700_000_020,
            "recorded_at": 1_700_000_021,
            "writer": "0x" + "44" * 20,
        }
        self.chain.get_access_event_by_session.return_value = access_event(20, 0)
        with (
            patch.object(EvidenceRepository, "get_all", return_value=[self.evidence]),
            patch.object(UserRepository, "list", return_value=[self.user]),
            patch.object(AccessLogRepository, "list", return_value=([], 0)),
        ):
            result = self.service.access_session(self.db, SESSION_REF)

        self.assertFalse(result["database_access_log_found"])
        self.assertEqual(result["actor"]["user_id"], USER_ID)
        self.assertEqual(result["tx_hash"], access_event(20, 0)["tx_hash"])
        BlockchainAccessSessionResponse(**result)

    def test_access_session_reports_optional_access_log(self):
        access_log = SimpleNamespace(log_id=LOG_ID)
        self.chain.get_access_by_session.return_value = {
            "evidence_ref": EVIDENCE_REF,
            "officer_ref": OFFICER_REF,
            "action": AccessAction.DOWNLOAD,
            "occurred_at": 1,
            "recorded_at": 2,
            "writer": "0x" + "44" * 20,
        }
        self.chain.get_access_event_by_session.return_value = None
        with (
            patch.object(EvidenceRepository, "get_all", return_value=[]),
            patch.object(UserRepository, "list", return_value=[]),
            patch.object(AccessLogRepository, "list", return_value=([access_log], 1)),
        ):
            result = self.service.access_session(self.db, SESSION_REF)

        self.assertTrue(result["database_access_log_found"])
        self.assertEqual(result["database_access_log_id"], LOG_ID)

    def test_block_and_transaction_not_found_are_controlled(self):
        self.chain.get_block.return_value = None
        self.chain.get_transaction.return_value = None
        with self.assertRaises(BlockchainExplorerNotFoundError):
            self.service.block(999)
        with self.assertRaises(BlockchainExplorerNotFoundError):
            self.service.transaction("0x" + "aa" * 32)

    def test_blockchain_failure_is_service_unavailable(self):
        self.chain.get_block.side_effect = RuntimeError("RPC unavailable")
        with self.assertRaises(BlockchainExplorerUnavailableError):
            self.service.block(20)


class BlockchainExplorerRouteTests(unittest.TestCase):
    def test_block_route_requires_admin_dependency(self):
        dependency = inspect.signature(block).parameters["_"].default
        self.assertIs(dependency.dependency, get_admin_user)

    def test_admin_block_lookup_success(self):
        expected = {"block_number": 20}
        service = Mock()
        service.block.return_value = expected
        with patch("app.routes.blockchain.BlockchainExplorerService", return_value=service):
            self.assertIs(block(20, SimpleNamespace(role="admin")), expected)

    def test_non_admin_and_anonymous_are_rejected(self):
        with self.assertRaises(HTTPException) as forbidden:
            get_admin_user(SimpleNamespace(role="officer"))
        self.assertEqual(forbidden.exception.status_code, 403)
        with self.assertRaises(HTTPException) as unauthorized:
            get_current_user(credentials=None, db=Mock())
        self.assertEqual(unauthorized.exception.status_code, 401)

    def test_unknown_transaction_maps_to_404(self):
        service = Mock()
        service.transaction.side_effect = BlockchainExplorerNotFoundError("missing")
        with patch("app.routes.blockchain.BlockchainExplorerService", return_value=service):
            with self.assertRaises(HTTPException) as raised:
                transaction("0x" + "aa" * 32, SimpleNamespace(role="admin"))
        self.assertEqual(raised.exception.status_code, 404)

    def test_unavailable_blockchain_maps_to_503(self):
        service = Mock()
        service.block.side_effect = BlockchainExplorerUnavailableError("offline")
        with patch("app.routes.blockchain.BlockchainExplorerService", return_value=service):
            with self.assertRaises(HTTPException) as raised:
                block(20, SimpleNamespace(role="admin"))
        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
