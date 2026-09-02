import uuid
from typing import Callable, Optional, TypeVar

T = TypeVar("T")


def resolve_by_ref(
    ref: str,
    get_by_id: Callable[[uuid.UUID], Optional[T]],
    get_by_number: Callable[[str], Optional[T]],
) -> Optional[T]:
    """หา entity จาก UUID หรือรหัสอ่านง่าย (เลขหลักฐาน/เลขคดี เช่น EV-.../CASE-...)

    ถ้า ref เป็นรูปแบบ UUID → หาโดย id อย่างเดียว (เลข EV-/CASE- ไม่มีทางเป็น UUID
    จึงไม่ต้องลองหาโดยรหัสต่อ) ถ้าไม่ใช่ UUID → หาโดยรหัส — คืน None ถ้าไม่พบ
    (ให้ผู้เรียกตัดสินใจเรื่อง 404 เอง)
    """
    # ครอบเฉพาะ "การ parse UUID" — ไม่ครอบ get_by_id เพื่อไม่กลืน error จริงจาก DB/ORM
    try:
        uid = uuid.UUID(str(ref))
    except (ValueError, AttributeError, TypeError):
        uid = None

    if uid is not None:
        return get_by_id(uid)

    return get_by_number(str(ref))
