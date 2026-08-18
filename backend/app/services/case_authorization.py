"""Server-side case visibility checks."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.cases import Case
from app.models.users import User


_SCOPE_CACHE_KEY = "case_authorization_scopes"


def _allowed_user_scope(db: Session, current_user: User) -> set[UUID]:
    cache = db.info.setdefault(_SCOPE_CACHE_KEY, {})
    cached_scope = cache.get(current_user.user_id)
    if cached_scope is not None:
        return cached_scope

    hierarchy = db.query(User.user_id, User.supervisor_id).all()
    children_by_supervisor: dict[UUID, set[UUID]] = {}
    for user_id, supervisor_id in hierarchy:
        if supervisor_id is not None:
            children_by_supervisor.setdefault(supervisor_id, set()).add(user_id)

    allowed = {current_user.user_id}
    pending = [current_user.user_id]
    while pending:
        supervisor_id = pending.pop()
        for subordinate_id in children_by_supervisor.get(supervisor_id, ()):
            if subordinate_id not in allowed:
                allowed.add(subordinate_id)
                pending.append(subordinate_id)

    cache[current_user.user_id] = allowed
    return allowed


def can_access_case(
    db: Session,
    current_user: User,
    case: Case,
) -> bool:
    """Return whether the current user can see the case."""

    # การตรวจสอบสิทธิ์ฝั่งเซิร์ฟเวอร์:
    # ใช้กฎเดียวกับหน้าเว็บ เพื่อไม่ให้การเข้าถึงหลักฐานพึ่งการตรวจฝั่งผู้ใช้เท่านั้น
    if current_user.role == "admin":
        return True

    allowed = _allowed_user_scope(db, current_user)
    return case.created_by in allowed or case.assigned_officer in allowed
