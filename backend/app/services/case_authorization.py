"""Server-side case visibility checks."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.case_assignees import CaseAssignee
from app.models.cases import Case
from app.models.users import User


_SCOPE_CACHE_KEY = "case_authorization_scopes"
_ASSIGNED_CACHE_KEY = "case_authorization_assigned_cases"


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


def subordinate_ids(db: Session, user: User) -> set[UUID]:
    """user_id ของผู้ใต้บังคับบัญชาทุกชั้น (ไม่รวมตัวเอง)

    ใช้ตอนมอบหมายคดี เพื่อบังคับว่าติ๊กได้เฉพาะลูกน้องของตัวเอง ณ ขณะนั้น
    """
    return _allowed_user_scope(db, user) - {user.user_id}


def _assigned_case_ids(db: Session, current_user: User) -> set[UUID]:
    """คดีที่ผู้ใช้คนนี้ถูกมอบหมายให้รับผิดชอบ

    เป็นสิทธิ์ถาวร ไม่ขึ้นกับสายบังคับบัญชาปัจจุบัน — ย้ายหัวหน้าแล้วยังเห็นคดีเดิม
    """
    cache = db.info.setdefault(_ASSIGNED_CACHE_KEY, {})
    cached = cache.get(current_user.user_id)
    if cached is not None:
        return cached

    assigned = {
        case_id
        for (case_id,) in db.query(CaseAssignee.case_id).filter(
            CaseAssignee.user_id == current_user.user_id
        )
    }
    cache[current_user.user_id] = assigned
    return assigned


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

    # ถูกมอบหมายให้รับผิดชอบคดีนี้โดยตรง = เห็นได้ถาวร
    # ตรวจก่อนสายบังคับบัญชา เพราะเป็นสิทธิ์ที่ไม่มีวันหลุด
    if case.case_id in _assigned_case_ids(db, current_user):
        return True

    allowed = _allowed_user_scope(db, current_user)
    return case.created_by in allowed or case.assigned_officer in allowed
