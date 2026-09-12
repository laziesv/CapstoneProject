"""ผู้รับผิดชอบคดี — ติ๊กแล้วเห็นถาวร แต่ติ๊กได้เฉพาะลูกน้อง ณ ตอนนั้น

เดิมคดีเก็บผู้รับผิดชอบได้คนเดียว (cases.assigned_officer) ทั้งที่หน้าเว็บให้ติ๊ก
หลายคน คนที่ 2 เป็นต้นไปจึงถูกทิ้งเงียบ ๆ และเข้าถึงคดีได้ทางสายบังคับบัญชา
เท่านั้น พอย้ายหัวหน้าก็หลุดสิทธิ์

พฤติกรรมที่ต้องการ
- ติ๊กแล้วได้สิทธิ์ถาวร ไม่ขึ้นกับสายบังคับบัญชาปัจจุบัน
- ตอนติ๊ก คนนั้นต้องเป็นลูกน้อง (หรือตัวเอง) ของผู้มอบหมาย
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import HTTPException

from app.services.case_authorization import can_access_case
from app.services.case_service import CaseService


def user(user_id=None, role="investigator"):
    return SimpleNamespace(user_id=user_id or uuid4(), role=role)


def case(case_id=None, created_by=None, assigned_officer=None):
    return SimpleNamespace(
        case_id=case_id or uuid4(),
        created_by=created_by or uuid4(),
        assigned_officer=assigned_officer,
        deleted_at=None,
    )


def db_for(hierarchy=(), assigned_case_ids=(), existing_users=()):
    """สร้าง session จำลองที่รองรับทั้งสามคำถามที่โค้ดจริงยิง

    - query(...).all()            → สายบังคับบัญชา
    - วนซ้ำบน query(...).filter() → คดีที่ผู้ใช้ถูกมอบหมาย
    - query(...).filter().all()   → ผู้ใช้ที่มีอยู่จริง (ตอนตรวจการมอบหมาย)
    """
    db = MagicMock()
    db.info = {}
    db.query.return_value.all.return_value = list(hierarchy)

    filtered = MagicMock()
    filtered.__iter__ = lambda _self: iter([(cid,) for cid in assigned_case_ids])
    filtered.all.return_value = [SimpleNamespace(user_id=u) for u in existing_users]
    db.query.return_value.filter.return_value = filtered
    return db


class PermanentAccessTests(unittest.TestCase):
    def test_assignee_sees_the_case_without_any_hierarchy_link(self) -> None:
        """หัวใจของเรื่อง — ไม่ต้องเป็นลูกน้องใครก็ยังเห็น เพราะถูกมอบหมายไว้"""
        actor = user(role="officer")
        target = case()
        db = db_for(hierarchy=[], assigned_case_ids=[target.case_id])

        self.assertTrue(can_access_case(db, actor, target))

    def test_non_assignee_without_hierarchy_cannot_see_it(self) -> None:
        actor = user(role="officer")
        target = case()
        self.assertFalse(can_access_case(db_for(), actor, target))

    def test_assignment_survives_losing_the_supervisor(self) -> None:
        """ย้ายหัวหน้าออกไปแล้ว (สายบังคับบัญชาว่าง) แต่ยังเห็นคดีเดิม"""
        actor = user(role="officer")
        target = case()
        db = db_for(hierarchy=[], assigned_case_ids=[target.case_id])
        self.assertTrue(can_access_case(db, actor, target))


class AssignmentValidationTests(unittest.TestCase):
    """ตอนติ๊ก คนนั้นต้องเป็นลูกน้องของผู้มอบหมาย"""

    def _validate(self, db, actor, assignees):
        return CaseService._validate_assignees(db, actor, assignees)

    def test_subordinate_can_be_assigned(self) -> None:
        boss = user()
        junior = uuid4()
        db = db_for(hierarchy=[(junior, boss.user_id)], existing_users=[junior])
        self.assertEqual(self._validate(db, boss, [junior]), [junior])

    def test_self_can_be_assigned(self) -> None:
        actor = user()
        db = db_for(hierarchy=[], existing_users=[])
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(user_id=actor.user_id)
        ]
        self.assertEqual(self._validate(db, actor, [actor.user_id]), [actor.user_id])

    def test_outsider_is_rejected(self) -> None:
        actor = user()
        db = db_for(hierarchy=[])
        with self.assertRaises(HTTPException) as raised:
            self._validate(db, actor, [uuid4()])
        self.assertEqual(raised.exception.status_code, 403)

    def test_former_subordinate_cannot_be_assigned_again(self) -> None:
        """ย้ายออกไปแล้วมอบหมายใหม่ไม่ได้ — แต่สิทธิ์เดิมที่เคยให้ไว้ยังอยู่
        (ดู PermanentAccessTests) สองเรื่องนี้ต้องอยู่ด้วยกันได้"""
        actor = user()
        gone = uuid4()
        db = db_for(hierarchy=[])  # ไม่มีใครเป็นลูกน้องแล้ว
        with self.assertRaises(HTTPException) as raised:
            self._validate(db, actor, [gone])
        self.assertEqual(raised.exception.status_code, 403)

    def test_admin_may_assign_anyone(self) -> None:
        admin = user(role="admin")
        outsider = uuid4()
        db = db_for(hierarchy=[], existing_users=[outsider])
        self.assertEqual(self._validate(db, admin, [outsider]), [outsider])

    def test_duplicates_are_collapsed_keeping_order(self) -> None:
        boss = user()
        a, b = uuid4(), uuid4()
        db = db_for(hierarchy=[(a, boss.user_id), (b, boss.user_id)], existing_users=[a, b])
        self.assertEqual(self._validate(db, boss, [a, b, a]), [a, b])

    def test_empty_list_needs_no_lookup(self) -> None:
        db = db_for()
        self.assertEqual(CaseService._validate_assignees(db, user(), []), [])
        db.query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
