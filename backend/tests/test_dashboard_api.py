import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from app.main import app
from app.services.dashboard_service import get_dashboard


def _user(role="officer", user_id=None):
    return SimpleNamespace(
        user_id=user_id or UUID("44444444-4444-4444-8444-444444444444"),
        role=role,
    )


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
            result = get_dashboard(Mock(), _user(role="admin"))

        self.assertEqual(result.stats.total_evidence, 1)
        self.assertEqual(result.recent_evidence[0].display_file_id, file_id)
        self.assertEqual(result.recent_activity[0].action, "view")
        self.assertEqual(result.recent_activity[0].result, "success")

class DashboardScopeTests(unittest.TestCase):
    """dashboard ต้องบอกเฉพาะสิ่งที่ผู้ใช้มีสิทธิ์เห็น

    เดิมคืนข้อมูลทั้งระบบให้ทุกคนที่ล็อกอิน คนที่ไม่มีสิทธิ์คดีไหนเลยจึงยังรู้ว่า
    ระบบมีหลักฐานเลขอะไรบ้าง และเห็นว่าใครเข้าถึงหลักฐานชิ้นไหน
    ทั้งที่ /api/access-logs เปิดให้เฉพาะ admin
    """

    def _run(self, current_user, accessible):
        captured = {}

        def stats(_db, case_ids=None):
            captured["stats_case_ids"] = case_ids
            return {
                "total_evidence": 0,
                "active_cases": 0,
                "blockchain_tx": 0,
                "verified": 0,
            }

        def recent_evidence(_db, case_ids=None):
            captured["evidence_case_ids"] = case_ids
            return []

        def recent_activity(_db, viewer_user_id=None):
            captured["viewer_user_id"] = viewer_user_id
            return []

        with (
            patch(
                "app.services.dashboard_service.accessible_case_ids",
                return_value=accessible,
            ),
            patch(
                "app.services.dashboard_service.DashboardRepository.get_dashboard_stats",
                side_effect=stats,
            ),
            patch(
                "app.services.dashboard_service.DashboardRepository.get_recent_evidence",
                side_effect=recent_evidence,
            ),
            patch(
                "app.services.dashboard_service.DashboardRepository.get_recent_activity",
                side_effect=recent_activity,
            ),
        ):
            get_dashboard(Mock(), current_user)
        return captured

    def test_officer_scope_is_passed_to_every_query(self):
        allowed = {UUID("55555555-5555-4555-8555-555555555555")}
        captured = self._run(_user(), allowed)

        self.assertEqual(captured["stats_case_ids"], allowed)
        self.assertEqual(captured["evidence_case_ids"], allowed)

    def test_officer_only_sees_their_own_activity(self):
        actor = _user()
        captured = self._run(actor, set())

        self.assertEqual(captured["viewer_user_id"], actor.user_id)

    def test_officer_without_any_case_gets_an_empty_scope_not_everything(self):
        """set ว่าง ต้องไม่ถูกตีความเป็น None (เห็นทุกคดี)"""
        captured = self._run(_user(), set())

        self.assertEqual(captured["stats_case_ids"], set())
        self.assertIsNotNone(captured["stats_case_ids"])

    def test_admin_sees_everything_and_all_activity(self):
        captured = self._run(_user(role="admin"), None)

        self.assertIsNone(captured["stats_case_ids"])
        self.assertIsNone(captured["evidence_case_ids"])
        self.assertIsNone(captured["viewer_user_id"])


class DashboardRepositoryScopeTests(unittest.TestCase):
    def test_empty_scope_filters_everything_out(self):
        """กันบั๊กคลาสสิก: in_([]) บางกรณีถูกเขียนพลาดเป็น 'ไม่กรอง'"""
        from app.repositories.dashboard_repository import _limit_to_cases

        query = Mock()
        _limit_to_cases(query, Mock(), set())
        query.filter.assert_called_once_with(False)

    def test_none_scope_does_not_filter(self):
        from app.repositories.dashboard_repository import _limit_to_cases

        query = Mock()
        self.assertIs(_limit_to_cases(query, Mock(), None), query)
        query.filter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
