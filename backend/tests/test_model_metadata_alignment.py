"""Focused checks for the final access-log SQLAlchemy metadata."""

from unittest import TestCase

from app.database import Base
from app.models import AccessLog, BlockchainTransaction  # noqa: F401
from app.models.enums import AuditAction, AuditResult


class ModelMetadataAlignmentTests(TestCase):
    def test_removed_audit_trail_is_not_registered(self) -> None:
        self.assertNotIn("audit_trails", Base.metadata.tables)

    def test_access_log_case_id_matches_final_schema(self) -> None:
        table = Base.metadata.tables["access_logs"]
        case_id = table.c.case_id

        self.assertTrue(case_id.nullable)
        self.assertEqual(str(case_id.type), "UUID")
        self.assertEqual(
            {foreign_key.target_fullname for foreign_key in case_id.foreign_keys},
            {"cases.case_id"},
        )
        self.assertEqual(
            {
                index.name
                for index in table.indexes
                if case_id.name in index.columns
            },
            {"ix_access_logs_case_id"},
        )

    def test_query_action_is_registered(self) -> None:
        self.assertEqual(AuditAction("QUERY"), AuditAction.QUERY)

    def test_pending_view_lifecycle_has_one_partial_unique_index(self) -> None:
        table = Base.metadata.tables["access_logs"]
        index = next(
            item for item in table.indexes if item.name == "uq_access_logs_pending_view"
        )

        self.assertTrue(index.unique)
        self.assertEqual(
            [column.name for column in index.columns],
            ["user_id", "evidence_id"],
        )
        self.assertEqual(AuditResult("PENDING"), AuditResult.PENDING)

    def test_blockchain_transaction_keeps_nullable_gas_without_input_hash(self) -> None:
        table = Base.metadata.tables["blockchain_transactions"]

        self.assertNotIn("input_data_hash", table.c)
        self.assertTrue(table.c.gas_used.nullable)
