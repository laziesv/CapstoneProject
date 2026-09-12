"""admin เปลี่ยนสิทธิ์ (role) ของผู้ใช้คนอื่นได้ โดยไม่ทำสายบังคับบัญชาพัง

ข้อจำกัดที่ต้องคงไว้พร้อมกัน
- ถอดสิทธิ์ admin ของตัวเองไม่ได้ (ไม่งั้นอาจไม่เหลือ admin ที่แก้กลับได้)
- ถอด role investigator ของคนที่ยังเป็นหัวหน้าใครอยู่ไม่ได้ เพราะระบบบังคับว่า
  หัวหน้าต้องเป็น investigator ถ้าปล่อยผ่าน ลูกน้องจะเหลือ supervisor_id ที่ชี้ไป
  ยังคนที่ไม่มีสิทธิ์เป็นหัวหน้า ซึ่งเป็นสถานะที่สร้างใหม่ผ่าน API ไม่ได้เลย
"""

import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

from app.schemas.user import UserUpdate
from app.services.user_service import ALLOWED_ROLES, update_user


def make_user(role="officer", subordinates=None, user_id=None):
    return SimpleNamespace(
        user_id=user_id or uuid4(),
        username=f"user-{role}",
        role=role,
        is_active=True,
        subordinates=subordinates or [],
        supervisor=None,
    )


class ChangeRoleTests(unittest.TestCase):
    def _update(self, target, actor, **fields):
        """เรียก update_user โดยแทน repository ทั้ง get และ update"""
        with (
            patch(
                "app.services.user_service.UserRepository.get_by_id",
                return_value=target,
            ),
            patch(
                "app.services.user_service.UserRepository.update",
                side_effect=lambda _db, user: user,
            ),
        ):
            return update_user(None, target.user_id, UserUpdate(**fields), actor)

    def test_admin_can_promote_another_user(self) -> None:
        target = make_user(role="officer")
        result = self._update(target, make_user(role="admin"), role="investigator")
        self.assertEqual(result.role, "investigator")

    def test_admin_can_demote_another_user_without_subordinates(self) -> None:
        target = make_user(role="investigator")
        result = self._update(target, make_user(role="admin"), role="officer")
        self.assertEqual(result.role, "officer")

    def test_every_allowed_role_can_be_assigned(self) -> None:
        for role in sorted(ALLOWED_ROLES):
            with self.subTest(role=role):
                target = make_user(role="officer")
                self.assertEqual(
                    self._update(target, make_user(role="admin"), role=role).role,
                    role,
                )

    def test_unknown_role_is_rejected(self) -> None:
        target = make_user(role="officer")
        with self.assertRaises(HTTPException) as raised:
            self._update(target, make_user(role="admin"), role="superuser")
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(target.role, "officer", "ต้องไม่ถูกแก้เมื่อค่าไม่ผ่าน")

    def test_admin_cannot_remove_own_admin_role(self) -> None:
        actor = make_user(role="admin")
        with self.assertRaises(HTTPException) as raised:
            self._update(actor, actor, role="officer")
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(actor.role, "admin")


class DemotingSupervisorTests(unittest.TestCase):
    """ถ้าไม่กันไว้ ลูกน้องจะเหลือหัวหน้าที่ไม่ใช่ investigator"""

    def _update(self, target, **fields):
        with (
            patch(
                "app.services.user_service.UserRepository.get_by_id",
                return_value=target,
            ),
            patch(
                "app.services.user_service.UserRepository.update",
                side_effect=lambda _db, user: user,
            ),
        ):
            return update_user(
                None, target.user_id, UserUpdate(**fields), make_user(role="admin")
            )

    def test_investigator_with_subordinates_cannot_be_demoted(self) -> None:
        boss = make_user(
            role="investigator",
            subordinates=[make_user(role="officer"), make_user(role="officer")],
        )
        boss.subordinates[0].username = "wichai.s"
        boss.subordinates[1].username = "anan.k"

        with self.assertRaises(HTTPException) as raised:
            self._update(boss, role="officer")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(boss.role, "investigator", "ต้องไม่ถูกแก้")
        # ข้อความต้องบอกว่าติดที่ใคร ผู้ใช้จะได้รู้ว่าต้องย้ายใครก่อน
        self.assertIn("anan.k", raised.exception.detail)
        self.assertIn("wichai.s", raised.exception.detail)

    def test_investigator_with_subordinates_can_still_be_edited_otherwise(self) -> None:
        """ข้อห้ามนี้ต้องจำกัดอยู่แค่การเปลี่ยน role ไม่ใช่ล็อกทั้งบัญชี"""
        boss = make_user(role="investigator", subordinates=[make_user()])
        result = self._update(boss, department="กองพิสูจน์หลักฐาน")
        self.assertEqual(result.department, "กองพิสูจน์หลักฐาน")
        self.assertEqual(result.role, "investigator")

    def test_keeping_investigator_role_is_not_blocked(self) -> None:
        """ส่ง role เดิมมาซ้ำต้องผ่าน ไม่ใช่ถูกปฏิเสธเพราะมีลูกน้อง"""
        boss = make_user(role="investigator", subordinates=[make_user()])
        self.assertEqual(self._update(boss, role="investigator").role, "investigator")


if __name__ == "__main__":
    unittest.main()
