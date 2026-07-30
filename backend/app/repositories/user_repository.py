from sqlalchemy.orm import Session

from app.models.users import User


class UserRepository:

    @staticmethod
    def get_by_username(
        db: Session,
        username: str,
    ) -> User | None:
        return (
            db.query(User)
            .filter(User.username == username)
            .first()
        )

    @staticmethod
    def get_by_id(
        db: Session,
        user_id: str,
    ) -> User | None:
        return (
            db.query(User)
            .filter(User.user_id == user_id)
            .first()
        )

    @staticmethod
    def get_by_email(
        db: Session,
        email: str,
    ) -> User | None:
        return (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

    @staticmethod
    def list(
        db: Session,
    ) -> list[User]:
        return (
            db.query(User)
            .order_by(User.created_at.desc().nullslast())
            .all()
        )

    @staticmethod
    def list_active(
        db: Session,
    ) -> list[User]:
        """เฉพาะผู้ใช้ที่ยังใช้งานอยู่ — ใช้กับ dropdown เลือกผู้รับผิดชอบ"""
        return (
            db.query(User)
            .filter(User.is_active.is_(True))
            .order_by(User.username)
            .all()
        )

    @staticmethod
    def create(
        db: Session,
        user: User,
    ) -> User:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def update(
        db: Session,
        user: User,
    ) -> User:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def delete(
        db: Session,
        user: User,
    ) -> None:
        db.delete(user)
        db.commit()