"""Focused checks for environment loading and the reconciled migration graph."""

import importlib.util
from contextlib import contextmanager
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

import sqlalchemy as sa

from app.environment import BACKEND_ENV_PATH, load_backend_environment
from app.models.enums import AuditAction, FileType


BACKEND_DIR = Path(__file__).resolve().parents[1]
VERSIONS_DIR = BACKEND_DIR / "alembic" / "versions"


def _load_migration(filename: str):
    path = VERSIONS_DIR / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class MigrationCompatibilityTests(TestCase):
    def test_reconciled_graph_has_one_merge_head(self) -> None:
        legacy_root = _load_migration("fa1497c19db3_legacy_history_marker.py")
        legacy_head = _load_migration("02677bad017f_legacy_history_marker.py")
        compatibility_merge = _load_migration(
            "c3f7a1d9e2b4_merge_legacy_and_integration.py"
        )
        query_action = _load_migration(
            "4eac92bd79a8_add_query_audit_action.py"
        )
        access_case = _load_migration(
            "b7e2c1a90f34_add_access_logs_case_id.py"
        )
        drop_audit = _load_migration(
            "d2f4a6b8c1e3_drop_audit_trails.py"
        )
        final_merge = _load_migration(
            "e8b4c2d7a901_merge_blockchain_and_dev_histories.py"
        )
        pending_view = _load_migration(
            "a6c8e1f4b2d9_add_pending_view_lifecycle.py"
        )
        remove_input_hash = _load_migration(
            "c7d9e2a4f6b1_remove_input_data_hash.py"
        )

        self.assertIsNone(legacy_root.down_revision)
        self.assertEqual(legacy_head.down_revision, legacy_root.revision)
        self.assertEqual(
            set(compatibility_merge.down_revision),
            {legacy_head.revision, "14f1bea4590d"},
        )
        self.assertEqual(query_action.down_revision, "14f1bea4590d")
        self.assertEqual(access_case.down_revision, query_action.revision)
        self.assertEqual(drop_audit.down_revision, access_case.revision)
        self.assertEqual(
            set(final_merge.down_revision),
            {compatibility_merge.revision, drop_audit.revision},
        )
        self.assertEqual(pending_view.down_revision, final_merge.revision)
        self.assertEqual(remove_input_hash.down_revision, pending_view.revision)

    def test_input_data_hash_removal_is_reversible(self) -> None:
        migration = _load_migration("c7d9e2a4f6b1_remove_input_data_hash.py")

        with self._inspected_columns(migration, ["tx_hash", "input_data_hash"]):
            with patch.object(migration.op, "drop_column") as drop_column:
                migration.upgrade()
        drop_column.assert_called_once_with(
            "blockchain_transactions",
            "input_data_hash",
        )

        with self._inspected_columns(migration, ["tx_hash"]):
            with patch.object(migration.op, "add_column") as add_column:
                migration.downgrade()
        table_name, column = add_column.call_args.args
        self.assertEqual(table_name, "blockchain_transactions")
        self.assertEqual(column.name, "input_data_hash")
        self.assertIsInstance(column.type, sa.Text)
        self.assertTrue(column.nullable)

    def test_input_data_hash_removal_skips_a_column_another_branch_dropped(self) -> None:
        """สาย deploy มี 7c2a4d9b8e13 ที่ลบคอลัมน์เดียวกัน พอรวมสองสายแล้ว
        ตัวที่รันทีหลังต้องข้ามไปเฉย ๆ ไม่ใช่ล้มทั้ง migration"""

        migration = _load_migration("c7d9e2a4f6b1_remove_input_data_hash.py")

        with self._inspected_columns(migration, ["tx_hash"]):
            with patch.object(migration.op, "drop_column") as drop_column:
                migration.upgrade()
        drop_column.assert_not_called()

        with self._inspected_columns(migration, ["tx_hash", "input_data_hash"]):
            with patch.object(migration.op, "add_column") as add_column:
                migration.downgrade()
        add_column.assert_not_called()

    @contextmanager
    def _inspected_columns(self, migration, names: list[str]):
        """ทำให้ migration มองเห็นคอลัมน์ตามที่กำหนด โดยไม่ต้องต่อฐานข้อมูลจริง"""

        inspector = Mock()
        inspector.get_columns.return_value = [{"name": name} for name in names]
        with patch.object(migration.op, "get_bind", return_value=Mock()):
            with patch.object(migration.sa, "inspect", return_value=inspector):
                yield

    def test_python_enums_accept_legacy_and_current_labels(self) -> None:
        self.assertEqual(FileType("IMAGE"), FileType.IMAGE)
        self.assertEqual(FileType("ORIGINAL"), FileType.ORIGINAL)
        self.assertEqual(AuditAction("CREATE"), AuditAction.CREATE)
        self.assertEqual(AuditAction("DOWNLOAD"), AuditAction.DOWNLOAD)

    def test_environment_loader_uses_explicit_backend_path(self) -> None:
        load_backend_environment.cache_clear()
        with patch("app.environment.load_dotenv", return_value=True) as loader:
            self.assertTrue(load_backend_environment())

        loader.assert_called_once_with(
            dotenv_path=BACKEND_ENV_PATH,
            override=False,
        )
        load_backend_environment.cache_clear()

    def test_backend_env_is_ignored_and_example_contains_placeholder(self) -> None:
        gitignore = (BACKEND_DIR / ".gitignore").read_text(encoding="utf-8")
        example = (BACKEND_DIR / ".env.example").read_text(encoding="utf-8")

        self.assertIn(".env", gitignore.splitlines())
        self.assertIn(
            "BLOCKCHAIN_WRITER_PRIVATE_KEY=<writer-private-key>",
            example.splitlines(),
        )
        self.assertNotIn("DB_NAME=capstone_blockchain_integration", example)
