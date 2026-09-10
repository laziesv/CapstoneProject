import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from app.main import app
from app.services.dashboard_service import get_dashboard


class DashboardApiTests(unittest.TestCase):
    def test_dashboard_route_is_registered(self):
        paths = {route.path for route in app.routes}

        self.assertIn("/api/dashboard", paths)

    def test_dashboard_uses_current_database_records(self):
        evidence_id = UUID("11111111-1111-4111-8111-111111111111")
        file_id = UUID("22222222-2222-4222-8222-222222222222")
        log_id = UUID("33333333-3333-4333-8333-333333333333")
        evidence = SimpleNamespace(
            evidence_id=evidence_id,
            evidence_number="EV-DASH-1",
            description="Synthetic dashboard evidence",
            display_file_id=file_id,
            is_watermarked=True,
            is_blockchain_verified=True,
        )
        access_log = SimpleNamespace(
            log_id=log_id,
            user_name="Admin User",
            action=SimpleNamespace(value="VIEW"),
            evidence_number="EV-DASH-1",
            result=SimpleNamespace(value="SUCCESS"),
            accessed_at=None,
        )
        with (
            patch(
                "app.services.dashboard_service.DashboardRepository.get_dashboard_stats",
                return_value={
                    "total_evidence": 1,
                    "active_cases": 1,
                    "blockchain_tx": 2,
                    "verified": 1,
                },
            ),
            patch(
                "app.services.dashboard_service.DashboardRepository.get_recent_evidence",
                return_value=[evidence],
            ),
            patch(
                "app.services.dashboard_service.DashboardRepository.get_recent_activity",
                return_value=[access_log],
            ),
        ):
            result = get_dashboard(Mock())

        self.assertEqual(result.stats.total_evidence, 1)
        self.assertEqual(result.recent_evidence[0].display_file_id, file_id)
        self.assertEqual(result.recent_activity[0].action, "view")
        self.assertEqual(result.recent_activity[0].result, "success")


if __name__ == "__main__":
    unittest.main()
