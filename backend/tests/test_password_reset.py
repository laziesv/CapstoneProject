"""ลืมรหัสผ่าน: admin รีเซ็ตเป็นรหัสชั่วคราว แล้วผู้ใช้ต้องตั้งรหัสใหม่ก่อนใช้งาน

admin รู้รหัสชั่วคราว จึงต้องบังคับเปลี่ยนที่ฝั่ง API ด้วย ไม่ใช่แค่หน้าเว็บ
ไม่งั้นคนที่ถือรหัสชั่วคราวเรียก API ตรง ๆ ได้ทุกอย่าง
"""

import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

from app.core.auth import hash_password, verify_password
from app.deps import (
    get_admin_user,
    get_authenticated_user,
    get_current_user,
    require_password_changed,
)
from app.routes.auth import change_password_route, me
from app.routes.users import reset_password_route
from app.services.auth_service import change_password
from app.services.user_service import (
    TEMP_PASSWORD_LENGTH,
    generate_temporary_password,
    reset_password,
)


def make_user(**fields):
    defaults = dict(
        user_id=uuid4(),
        username="target",
        role="officer",
        is_active=True,
        must_change_password=False,
        password_hash=hash_password("old-password-123"),
        updated_at=None,
    )
    defaults.update(fields)
    return SimpleNamespace(**defaults)


def _dependency_of(func, name):
    return inspect.signature(func).parameters[name].default.dependency


class ResetPasswordServiceTests(unittest.TestCase):
    def _reset(self, target, actor):
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
            return reset_password(None, target.user_id if target else uuid4(), actor)

    def test_admin_reset_sets_temporary_password_and_forces_change(self):
        target = make_user()
        temporary = self._reset(target, make_user(role="admin"))

        self.assertTrue(verify_password(temporary, target.password_hash))
        self.assertFalse(verify_password("old-password-123", target.password_hash))
        self.assertTrue(target.must_change_password)
        self.assertIsNotNone(target.updated_at)

    def test_cannot_reset_own_password(self):
        admin = make_user(role="admin")
        with self.assertRaises(HTTPException) as ctx:
            self._reset(admin, admin)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertFalse(admin.must_change_password)

    def test_unknown_user_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self._reset(None, make_user(role="admin"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_temporary_password_meets_policy_and_avoids_ambiguous_characters(self):
        for _ in range(50):
            temporary = generate_temporary_password()
            self.assertEqual(len(temporary), TEMP_PASSWORD_LENGTH)
            self.assertGreaterEqual(len(temporary), 8)  # ผ่าน min_length ของ ChangePasswordRequest
            self.assertFalse(set(temporary) & set("0O1lI"))

    def test_temporary_passwords_are_not_repeated(self):
        self.assertEqual(len({generate_temporary_password() for _ in range(50)}), 50)


class ForcedPasswordChangeTests(unittest.TestCase):
    def test_flagged_user_is_blocked_from_normal_routes(self):
        with self.assertRaises(HTTPException) as ctx:
            require_password_changed(make_user(must_change_password=True))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "PASSWORD_CHANGE_REQUIRED")

    def test_unflagged_user_passes(self):
        user = make_user()
        self.assertIs(require_password_changed(user), user)

    def test_get_current_user_enforces_the_flag(self):
        flagged = make_user(must_change_password=True)
        with patch("app.deps.get_authenticated_user", return_value=flagged):
            with self.assertRaises(HTTPException) as ctx:
                get_current_user(credentials=None, db=None)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_admin_routes_also_require_the_change(self):
        """get_admin_user ต้องผ่าน get_current_user ไม่งั้น admin ที่ถูกรีเซ็ตข้ามการบังคับได้"""
        self.assertIs(_dependency_of(get_admin_user, "current_user"), get_current_user)

    def test_me_and_change_password_stay_reachable(self):
        self.assertIs(_dependency_of(me, "current_user"), get_authenticated_user)
        self.assertIs(
            _dependency_of(change_password_route, "current_user"),
            get_authenticated_user,
        )

    def test_reset_route_is_admin_only(self):
        self.assertIs(_dependency_of(reset_password_route, "admin"), get_admin_user)

    def test_changing_password_clears_the_flag(self):
        user = make_user(
            must_change_password=True,
            password_hash=hash_password("Temp2345abcd"),
        )
        with patch("app.services.auth_service.UserRepository.update"):
            change_password(None, user, "Temp2345abcd", "brand-new-password")

        self.assertFalse(user.must_change_password)
        self.assertTrue(verify_password("brand-new-password", user.password_hash))


if __name__ == "__main__":
    unittest.main()
