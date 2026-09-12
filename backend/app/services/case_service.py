import uuid
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.case_assignees import CaseAssignee
from app.models.cases import Case
from app.models.users import User
from app.repositories.case_repository import CaseRepository
from app.schemas.case import CaseCreate, CaseUpdate
from app.services.case_authorization import subordinate_ids
from app.utils.ref_lookup import resolve_by_ref


class CaseService:
    @staticmethod
    def generate_case_number() -> str:
        return f"CASE-{uuid.uuid4().hex[:8].upper()}"

    @staticmethod
    def get_all(db: Session) -> Sequence[Case]:
        return CaseRepository.get_all(db)

    @staticmethod
    def get_by_id(db: Session, case_id: uuid.UUID) -> Case:
        case = CaseRepository.get_by_id(db, case_id)

        if not case:
            raise HTTPException(
                status_code=404,
                detail="Case not found",
            )

        return case

    @staticmethod
    def get_by_ref(db: Session, ref: str) -> Case:
        """หาคดีจาก UUID หรือเลขคดี (เช่น CASE-2026-0061) — ไม่เจอโยน 404"""
        case = resolve_by_ref(
            ref,
            lambda u: CaseRepository.get_by_id(db, u),
            lambda n: CaseRepository.get_by_number(db, n),
        )

        if not case:
            raise HTTPException(status_code=404, detail="Case not found")

        return case


    @staticmethod
    def _validate_assignees(
        db: Session,
        actor: User,
        assignees: Sequence[uuid.UUID],
    ) -> list[uuid.UUID]:
        """ตรวจว่ามอบหมายคนเหล่านี้ได้ไหม แล้วคืนรายชื่อที่ไม่ซ้ำตามลำดับเดิม

        มอบหมายได้เฉพาะตัวเองกับผู้ใต้บังคับบัญชา ณ ขณะนั้น (admin มอบหมายใครก็ได้)
        เงื่อนไขนี้ตรวจ "ตอนมอบหมาย" เท่านั้น — เมื่อบันทึกแล้วสิทธิ์อยู่ถาวร
        ย้ายหัวหน้าภายหลังก็ไม่หลุด ซึ่งเป็นจุดประสงค์ของตารางนี้
        """
        unique: list[uuid.UUID] = []
        for user_id in assignees:
            if user_id not in unique:
                unique.append(user_id)

        if not unique:
            return unique

        if actor.role != "admin":
            allowed = subordinate_ids(db, actor) | {actor.user_id}
            outside = [u for u in unique if u not in allowed]
            if outside:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "มอบหมายได้เฉพาะตัวเองและผู้ใต้บังคับบัญชาของคุณเท่านั้น"
                    ),
                )

        existing = {
            u.user_id
            for u in db.query(User.user_id).filter(User.user_id.in_(unique)).all()
        }
        missing = [u for u in unique if u not in existing]
        if missing:
            raise HTTPException(
                status_code=404,
                detail="ไม่พบผู้ใช้ที่จะมอบหมายบางราย",
            )

        return unique

    @staticmethod
    def _replace_assignees(
        db: Session,
        case: Case,
        assignees: Sequence[uuid.UUID],
        actor: User,
    ) -> None:
        """ตั้งรายชื่อผู้รับผิดชอบใหม่ทั้งชุด โดยคงแถวเดิมของคนที่ยังอยู่

        ไม่ลบแล้วสร้างใหม่ทั้งหมด เพราะจะทำให้ assigned_at เสียไป
        ซึ่งเป็นหลักฐานว่าได้รับมอบหมายตั้งแต่เมื่อไหร่
        """
        target = list(assignees)
        current = {link.user_id: link for link in case.assignee_links}

        for user_id, link in current.items():
            if user_id not in target:
                case.assignee_links.remove(link)

        for user_id in target:
            if user_id not in current:
                case.assignee_links.append(
                    CaseAssignee(user_id=user_id, assigned_by=actor.user_id)
                )

    @staticmethod
    def create(
        db: Session,
        data: CaseCreate,
        current_user: User,
    ) -> Case:
        fields = data.model_dump()
        assignees = CaseService._validate_assignees(
            db, current_user, fields.pop("assigned_officers", []) or []
        )

        # ผู้รับผิดชอบหลักใช้สำหรับแสดงผล ถ้าไม่ได้ระบุมาก็ใช้คนแรกที่ถูกติ๊ก
        if fields.get("assigned_officer") is None and assignees:
            fields["assigned_officer"] = assignees[0]
        elif fields.get("assigned_officer") is not None:
            # คนที่ถูกตั้งเป็นผู้รับผิดชอบหลักต้องอยู่ในรายชื่อด้วยเสมอ
            primary = fields["assigned_officer"]
            if primary not in assignees:
                assignees = CaseService._validate_assignees(
                    db, current_user, [primary, *assignees]
                )

        case = Case(
            **fields,
            case_number=CaseService.generate_case_number(),
            created_by=current_user.user_id,
        )
        CaseService._replace_assignees(db, case, assignees, current_user)

        return CaseRepository.create(db, case)

    @staticmethod
    def update(
        db: Session,
        case_id: uuid.UUID,
        data: CaseUpdate,
        current_user: User,
    ) -> Case:
        case = CaseService.get_by_id(db, case_id)

        changes = data.model_dump(exclude_unset=True)
        assignees = changes.pop("assigned_officers", None)

        for key, value in changes.items():
            setattr(case, key, value)

        if assignees is not None:
            validated = CaseService._validate_assignees(db, current_user, assignees)
            CaseService._replace_assignees(db, case, validated, current_user)
            # ผู้รับผิดชอบหลักต้องอยู่ในรายชื่อเสมอ ไม่งั้นจะแสดงคนที่ไม่มีสิทธิ์แล้ว
            if case.assigned_officer not in validated:
                case.assigned_officer = validated[0] if validated else None

        return CaseRepository.update(db, case)

    @staticmethod
    def delete(
        db: Session,
        case_id: uuid.UUID,
    ) -> Case:
        case = CaseService.get_by_id(db, case_id)

        return CaseRepository.delete(db, case)
