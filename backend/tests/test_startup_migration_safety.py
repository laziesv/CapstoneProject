import unittest
from unittest.mock import patch

from app.core import startup as startup_module


class StartupMigrationSafetyTests(unittest.TestCase):
    def test_startup_does_not_run_alembic_upgrade(self):
        with (
            patch.object(startup_module, "test_database_connection"),
            patch.object(startup_module, "seed_admin"),
            patch.object(startup_module, "seed_demo_users"),
            patch("alembic.command.upgrade") as upgrade,
        ):
            startup_module.startup()

        upgrade.assert_not_called()

    def test_application_module_is_importable(self):
        from app.main import app

        self.assertEqual(app.title, "DEVA API")


if __name__ == "__main__":
    unittest.main()
