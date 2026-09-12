"""/api/cases ต้องกรองสิทธิ์ฝั่งเซิร์ฟเวอร์ ไม่ใช่พึ่งการกรองในหน้าเว็บ

เดิม GET /api/cases คืนทุกคดีให้ทุกคนที่ล็อกอิน แล้วให้ frontend กรองเอง
ซึ่งเป็นแค่การซ่อน UI — ใครยิง API ตรง ๆ ก็เห็นเลขคดี ชื่อคดี วันเกิดเหตุ
และผู้รับผิดชอบของคดีที่ตัวเองไม่มีสิทธิ์ ส่วน PUT/DELETE ตรวจแค่ยศ
investigator ทำให้ investigator คนไหนก็แก้หรือลบคดีของหน่วยอื่นได้
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routes.case import delete_case, get_case, get_cases, update_case


def user(user_id=None, role="officer"):
    return SimpleNamespace(user_id=user_id or uuid4(), role=role)


def case(case_id=None, created_by=None, assigned_officer=None, number="CASE-X"):
    return SimpleNamespace(
        case_id=case_id or uuid4(),
        case_number=number,
        created_by=created_by,
        assigned_officer=assigned_officer,
        deleted_at=None,
    )


def db_with_hierarchy(rows=()):
    """rows = [(user_id, supervisor_id), ...] ที่ _allowed_user_scope จะอ่าน"""
    db = MagicMock()
    db.info = {}
    db.query.return_value.all.return_value = list(rows)
    return db


class ListCasesTests(unittest.TestCase):
    def _list(self, db, actor, cases):
        with patch("app.routes.case.CaseService.get_all", return_value=cases):
            return get_cases(db=db, current_user=actor)

    def test_admin_sees_every_case(self) -> None:
        admin = user(role="admin")
        cases = [case(), case(), case()]
        self.assertEqual(self._list(db_with_hierarchy(), admin, cases), cases)

    def test_officer_sees_only_own_cases(self) -> None:
        actor = user()
        mine = case(created_by=actor.user_id)
        assigned = case(assigned_officer=actor.user_id)
        other = case(created_by=uuid4())

        visible = self._list(db_with_hierarchy(), actor, [mine, assigned, other])

        self.assertEqual(visible, [mine, assigned])
        self.assertNotIn(other, visible, "คดีของคนอื่นต้องไม่หลุดออกไปทาง API")

    def test_supervisor_also_sees_subordinate_cases(self) -> None:
        boss = user(role="investigator")
        junior = user()
        db = db_with_hierarchy([(junior.user_id, boss.user_id)])

        theirs = case(created_by=junior.user_id)
        stranger = case(created_by=uuid4())

        self.assertEqual(self._list(db, boss, [theirs, stranger]), [theirs])

    def test_subordinate_does_not_see_supervisor_cases(self) -> None:
        """สิทธิ์ไหลลงทางเดียว — ลูกน้องไม่เห็นคดีของหัวหน้า"""
        boss = user(role="investigator")
        junior = user()
        db = db_with_hierarchy([(junior.user_id, boss.user_id)])

        self.assertEqual(self._list(db, junior, [case(created_by=boss.user_id)]), [])


class SingleCaseTests(unittest.TestCase):
    def test_unauthorized_read_is_404_not_403(self) -> None:
        """403 จะเป็นการยืนยันว่าเลขคดีนี้มีจริง ทำให้ไล่เดาเลขคดีได้"""
        target = case(created_by=uuid4())
        with patch("app.routes.case.CaseService.get_by_ref", return_value=target):
            with self.assertRaises(HTTPException) as raised:
                get_case(
                    case_ref=target.case_number,
                    db=db_with_hierarchy(),
                    current_user=user(),
                )
        self.assertEqual(raised.exception.status_code, 404)

    def test_authorized_read_returns_the_case(self) -> None:
        actor = user()
        target = case(created_by=actor.user_id)
        with patch("app.routes.case.CaseService.get_by_ref", return_value=target):
            self.assertIs(
                get_case(
                    case_ref=target.case_number,
                    db=db_with_hierarchy(),
                    current_user=actor,
                ),
                target,
            )


class WriteAccessTests(unittest.TestCase):
    """ยศ investigator อย่างเดียวไม่พอ ต้องเป็นคดีที่ตัวเองมีสิทธิ์ด้วย"""

    def test_investigator_cannot_update_another_units_case(self) -> None:
        target = case(created_by=uuid4())
        with (
            patch("app.routes.case.CaseService.get_by_id", return_value=target),
            patch("app.routes.case.CaseService.update") as update,
        ):
            with self.assertRaises(HTTPException) as raised:
                update_case(
                    case_id=target.case_id,
                    data=MagicMock(),
                    db=db_with_hierarchy(),
                    current_user=user(role="investigator"),
                )
        self.assertEqual(raised.exception.status_code, 404)
        update.assert_not_called()

    def test_investigator_cannot_delete_another_units_case(self) -> None:
        target = case(created_by=uuid4())
        with (
            patch("app.routes.case.CaseService.get_by_id", return_value=target),
            patch("app.routes.case.CaseService.delete") as delete,
        ):
            with self.assertRaises(HTTPException) as raised:
                delete_case(
                    case_id=target.case_id,
                    db=db_with_hierarchy(),
                    current_user=user(role="investigator"),
                )
        self.assertEqual(raised.exception.status_code, 404)
        delete.assert_not_called()

    def test_investigator_can_still_update_own_case(self) -> None:
        actor = user(role="investigator")
        target = case(created_by=actor.user_id)
        with (
            patch("app.routes.case.CaseService.get_by_id", return_value=target),
            patch("app.routes.case.CaseService.update", return_value=target) as update,
        ):
            update_case(
                case_id=target.case_id,
                data=MagicMock(),
                db=db_with_hierarchy(),
                current_user=actor,
            )
        update.assert_called_once()


if __name__ == "__main__":
    unittest.main()
