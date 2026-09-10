import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routes.evidence_items import list_all
from app.services.case_authorization import can_access_case


def user(user_id=None, role="officer"):
    return SimpleNamespace(user_id=user_id or uuid4(), role=role)


def case(created_by=None, assigned_officer=None, deleted_at=None):
    return SimpleNamespace(
        case_id=uuid4(),
        created_by=created_by,
        assigned_officer=assigned_officer,
        deleted_at=deleted_at,
    )


def session_with_hierarchy(rows):
    db = MagicMock()
    db.info = {}
    db.query.return_value.all.return_value = rows
    return db


class CaseAuthorizationTests(unittest.TestCase):
    def test_admin_can_access_unrelated_case_without_hierarchy_query(self):
        db = session_with_hierarchy([])
        self.assertTrue(can_access_case(db, user(role="admin"), case()))
        db.query.assert_not_called()

    def test_direct_creator_can_access(self):
        actor = user()
        self.assertTrue(can_access_case(session_with_hierarchy([]), actor, case(created_by=actor.user_id)))

    def test_direct_assigned_officer_can_access(self):
        actor = user()
        self.assertTrue(can_access_case(session_with_hierarchy([]), actor, case(assigned_officer=actor.user_id)))

    def test_manager_can_access_direct_subordinate_case(self):
        manager = user()
        subordinate_id = uuid4()
        db = session_with_hierarchy([(subordinate_id, manager.user_id)])
        self.assertTrue(can_access_case(db, manager, case(created_by=subordinate_id)))

    def test_manager_can_access_transitive_subordinate_case(self):
        manager = user()
        supervisor_id = uuid4()
        officer_id = uuid4()
        db = session_with_hierarchy([
            (supervisor_id, manager.user_id),
            (officer_id, supervisor_id),
        ])
        self.assertTrue(can_access_case(db, manager, case(assigned_officer=officer_id)))

    def test_subordinate_cannot_access_supervisor_case(self):
        supervisor_id = uuid4()
        subordinate = user()
        db = session_with_hierarchy([(subordinate.user_id, supervisor_id)])
        self.assertFalse(can_access_case(db, subordinate, case(created_by=supervisor_id)))

    def test_unrelated_user_is_denied(self):
        self.assertFalse(can_access_case(session_with_hierarchy([]), user(), case(created_by=uuid4())))

    def test_malformed_cycle_terminates_deterministically(self):
        actor = user()
        other_id = uuid4()
        db = session_with_hierarchy([
            (actor.user_id, other_id),
            (other_id, actor.user_id),
        ])
        target = case(created_by=other_id)
        self.assertTrue(can_access_case(db, actor, target))
        self.assertTrue(can_access_case(db, actor, target))
        db.query.assert_called_once()


class EvidenceMetadataAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.current_user = user()
        self.target_case = case(created_by=self.current_user.user_id)

    @patch("app.routes.evidence_items.EvidenceResponse.model_validate", side_effect=lambda item: item)
    @patch("app.routes.evidence_items.EvidenceService.get_all")
    @patch("app.routes.evidence_items.can_access_case")
    @patch("app.routes.evidence_items.CaseRepository.get_by_id")
    def test_authorized_specific_case_returns_evidence(self, get_case, can_access, get_all, _validate):
        item = SimpleNamespace(file_hash="hash")
        get_case.return_value = self.target_case
        can_access.return_value = True
        get_all.return_value = [item]

        result = list_all(self.target_case.case_id, self.db, self.current_user)

        self.assertEqual(result, [item])
        get_all.assert_called_once_with(self.db, self.target_case.case_id)

    @patch("app.routes.evidence_items.EvidenceService.get_all")
    @patch("app.routes.evidence_items.can_access_case", return_value=False)
    @patch("app.routes.evidence_items.CaseRepository.get_by_id")
    def test_inaccessible_specific_case_is_404_before_evidence_query(self, get_case, _can_access, get_all):
        get_case.return_value = self.target_case
        with self.assertRaises(HTTPException) as raised:
            list_all(self.target_case.case_id, self.db, self.current_user)
        self.assertEqual(raised.exception.status_code, 404)
        get_all.assert_not_called()

    @patch("app.routes.evidence_items.EvidenceService.get_all")
    @patch("app.routes.evidence_items.can_access_case")
    @patch("app.routes.evidence_items.CaseRepository.get_by_id", return_value=None)
    def test_unknown_specific_case_is_404_before_authorization_or_evidence_query(
        self,
        _get_case,
        can_access,
        get_all,
    ):
        with self.assertRaises(HTTPException) as raised:
            list_all(uuid4(), self.db, self.current_user)
        self.assertEqual(raised.exception.status_code, 404)
        can_access.assert_not_called()
        get_all.assert_not_called()

    @patch("app.routes.evidence_items.EvidenceResponse.model_validate", side_effect=lambda item: item)
    @patch("app.routes.evidence_items.EvidenceService.get_all")
    @patch("app.routes.evidence_items.can_access_case")
    def test_unscoped_listing_filters_inaccessible_evidence_server_side(self, can_access, get_all, _validate):
        allowed_case = self.target_case
        denied_case = case(created_by=uuid4())
        allowed_item = SimpleNamespace(case=allowed_case, file_hash="hash")
        denied_item = SimpleNamespace(case=denied_case, file_hash="hash")
        get_all.return_value = [allowed_item, denied_item]
        can_access.side_effect = lambda _db, _user, target: target is allowed_case

        result = list_all(None, self.db, self.current_user)

        self.assertEqual(result, [allowed_item])

    @patch("app.routes.evidence_items.EvidenceResponse.model_validate", side_effect=lambda item: item)
    @patch("app.routes.evidence_items.EvidenceService.get_all")
    @patch("app.routes.evidence_items.can_access_case", return_value=True)
    def test_admin_unscoped_listing_keeps_non_deleted_evidence(self, _can_access, get_all, _validate):
        admin = user(role="admin")
        item = SimpleNamespace(case=case(), file_hash="hash")
        deleted_item = SimpleNamespace(case=case(deleted_at=object()), file_hash="hash")
        get_all.return_value = [item, deleted_item]
        self.assertEqual(list_all(None, self.db, admin), [item])

    def test_route_still_requires_current_user_dependency(self):
        dependency = next(
            parameter.default.dependency
            for parameter in __import__("inspect").signature(list_all).parameters.values()
            if getattr(parameter.default, "dependency", None) is not None
            and parameter.name == "current_user"
        )
        self.assertEqual(dependency.__name__, "get_current_user")


if __name__ == "__main__":
    unittest.main()
