"""Seed ข้อมูลตัวอย่างสำหรับ demo dashboard — รันเฉพาะตอนตารางยังว่าง"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import engine
from app.models.user import User
from app.models.case import Case
from app.models.evidence import EvidenceItem
from app.models.blockchain_transaction import BlockchainTransaction
from app.models.access_log import AccessLog
from app.models.evidence_file import EvidenceFile
from app.models.custody_event import CustodyEvent
from app.models.integrity_check import IntegrityCheck
from app.models.enums import (
    CaseStatus,
    EvidenceStatus,
    FileType,
    BlockchainAction,
    AuditAction,
    AuditResult,
    CustodyAction,
)


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def seed_sample_data():
    db = Session(bind=engine)

    # seed เฉพาะครั้งแรก (ยังไม่มี case ใดในระบบ)
    if db.query(Case).first():
        print("[INFO] Sample data already exists")
        db.close()
        return

    # ── เจ้าหน้าที่เพิ่มเติม (นอกเหนือจาก admin) ──────────
    somsak = User(
        username="somsak.p",
        email="somsak@police.go.th",
        password_hash=hash_password("password123"),
        full_name="พ.ต.ท.สมศักดิ์ ภักดี",
        rank="พันตำรวจโท",
        department="กองพิสูจน์หลักฐาน",
        badge_number="OFF-1820",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    wichai = User(
        username="wichai.s",
        email="wichai@police.go.th",
        password_hash=hash_password("password123"),
        full_name="ด.ต.วิชัย สมบูรณ์",
        rank="ดาบตำรวจ",
        department="งานสืบสวน",
        badge_number="OFF-3344",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add_all([somsak, wichai])
    db.flush()

    admin = db.query(User).filter(User.username == "admin").first()
    officer_id = admin.user_id if admin else somsak.user_id

    # ── คดี ─────────────────────────────────────────────
    c1 = Case(case_number="CASE-2026-0042", title="คดีลักทรัพย์ ซ.สุขุมวิท 23",
              description="เหตุลักทรัพย์ภายในอาคารพาณิชย์", status=CaseStatus.INVESTIGATING,
              created_by=officer_id, assigned_officer=officer_id,
              incident_date=_dt("2026-04-10T00:00:00"), location="ซ.สุขุมวิท 23 กรุงเทพฯ",
              created_at=_dt("2026-04-11T08:00:00"))
    c2 = Case(case_number="CASE-2026-0058", title="คดีทำร้ายร่างกาย ตลาดนัด",
              description="เหตุทำร้ายร่างกายบริเวณตลาดนัด", status=CaseStatus.OPEN,
              created_by=officer_id, assigned_officer=officer_id,
              incident_date=_dt("2026-04-22T00:00:00"), location="ตลาดนัดจตุจักร กรุงเทพฯ",
              created_at=_dt("2026-04-22T14:30:00"))
    c3 = Case(case_number="CASE-2026-0061", title="คดีวิ่งราวทรัพย์ สยามสแควร์",
              description="เหตุวิ่งราวทรัพย์บริเวณทางเดินสยามสแควร์", status=CaseStatus.OPEN,
              created_by=somsak.user_id, assigned_officer=officer_id,
              incident_date=_dt("2026-04-28T00:00:00"), location="สยามสแควร์ กรุงเทพฯ",
              created_at=_dt("2026-04-28T10:15:00"))
    c4 = Case(case_number="CASE-2025-0189", title="คดียาเสพติด ลาดพร้าว",
              description="จับกุมยาเสพติดย่านลาดพร้าว", status=CaseStatus.CLOSED,
              created_by=officer_id, assigned_officer=officer_id,
              incident_date=_dt("2025-12-05T00:00:00"), location="ลาดพร้าว กรุงเทพฯ",
              created_at=_dt("2025-12-05T16:00:00"), closed_at=_dt("2026-02-01T10:00:00"))
    db.add_all([c1, c2, c3, c4])
    db.flush()

    # ── หลักฐาน ─────────────────────────────────────────
    e1 = EvidenceItem(evidence_number="EV-2026-00101", case_id=c1.case_id, uploaded_by=officer_id,
                      category="crime_scene", description="ภาพถ่ายจุดเกิดเหตุ ประตูหน้าร้าน",
                      original_filename="scene_001.jpg", status=EvidenceStatus.VERIFIED,
                      file_hash_sha256="a3f2c8d1e5b94f7a6c0d3e8b1f4a7c2d5e8b0f3a6c9d2e5b8a1c4f7d0e3b6a9c",
                      is_watermarked=True, is_blockchain_verified=True,
                      captured_at=_dt("2026-04-10T14:23:00"), uploaded_at=_dt("2026-04-11T08:15:00"),
                      verified_at=_dt("2026-04-15T09:00:00"))
    e2 = EvidenceItem(evidence_number="EV-2026-00102", case_id=c1.case_id, uploaded_by=officer_id,
                      category="forensic", description="ลายนิ้วมือบริเวณลูกบิดประตู",
                      original_filename="fingerprint_door.jpg", status=EvidenceStatus.VERIFIED,
                      file_hash_sha256="b4e3d9a2f6c05e8b7d1a4f7c0e3b6a9d2f5c8b1e4a7d0c3f6b9a2e5d8c1f4a7d",
                      is_watermarked=True, is_blockchain_verified=True,
                      captured_at=_dt("2026-04-10T14:45:00"), uploaded_at=_dt("2026-04-11T08:20:00"))
    e3 = EvidenceItem(evidence_number="EV-2026-00103", case_id=c1.case_id, uploaded_by=officer_id,
                      category="surveillance", description="ภาพจากกล้องวงจรปิดด้านหน้าร้าน",
                      original_filename="cctv_front.jpg", status=EvidenceStatus.PENDING,
                      file_hash_sha256="c5f4e0b3a7d16f9c8e2b5a8d1f4c7e0b3a6d9c2f5e8b1a4d7f0c3e6b9a2d5c8e",
                      is_watermarked=True, is_blockchain_verified=False,
                      captured_at=_dt("2026-04-10T13:00:00"), uploaded_at=_dt("2026-04-12T09:00:00"))
    e4 = EvidenceItem(evidence_number="EV-2026-00201", case_id=c2.case_id, uploaded_by=officer_id,
                      category="crime_scene", description="ภาพถ่ายจุดเกิดเหตุภายในตลาด",
                      original_filename="market_scene.jpg", status=EvidenceStatus.VERIFIED,
                      file_hash_sha256="d6a5f1c4b8e27a0d9f3c6b9e2a5d8f1c4b7e0a3d6c9f2b5e8a1d4c7f0b3e6a9f",
                      is_watermarked=True, is_blockchain_verified=True,
                      captured_at=_dt("2026-04-22T15:10:00"), uploaded_at=_dt("2026-04-22T16:00:00"))
    e5 = EvidenceItem(evidence_number="EV-2026-00301", case_id=c3.case_id, uploaded_by=officer_id,
                      category="surveillance", description="กล้องวงจรปิด ทางเดินสยามสแควร์",
                      original_filename="siam_cctv_01.jpg", status=EvidenceStatus.FLAGGED,
                      file_hash_sha256="e7b6a2d5c9f38b1e0a4d7c0f3b6e9a2d5c8f1b4e7a0d3c6f9b2e5a8d1c4f7b0a",
                      is_watermarked=False, is_blockchain_verified=False,
                      captured_at=_dt("2026-04-28T09:30:00"), uploaded_at=_dt("2026-04-29T10:00:00"))
    e6 = EvidenceItem(evidence_number="EV-2026-00302", case_id=c3.case_id, uploaded_by=officer_id,
                      category="document", description="ใบแจ้งความ เหตุวิ่งราวทรัพย์",
                      original_filename="report_doc.jpg", status=EvidenceStatus.PENDING,
                      file_hash_sha256="f8c7b3e6d0a49c2f1b5e8a1d4c7f0b3e6a9d2c5f8b1e4a7d0c3f6b9a2e5d8c1b",
                      is_watermarked=False, is_blockchain_verified=False,
                      captured_at=_dt("2026-04-28T11:00:00"), uploaded_at=_dt("2026-04-29T10:05:00"))
    db.add_all([e1, e2, e3, e4, e5, e6])
    db.flush()

    # ── ธุรกรรม blockchain ──────────────────────────────
    contract = "0x5b8da53d35a0993d44c1825c3ed955525a000000"
    txs = [
        BlockchainTransaction(tx_hash="0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
                              evidence_id=e1.evidence_id, initiated_by=officer_id,
                              action_type=BlockchainAction.REGISTER, block_number=18234501,
                              contract_address=contract, status="confirmed", gas_used=52341,
                              block_timestamp=_dt("2026-04-11T08:15:30")),
        BlockchainTransaction(tx_hash="0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
                              evidence_id=e2.evidence_id, initiated_by=officer_id,
                              action_type=BlockchainAction.REGISTER, block_number=18234510,
                              contract_address=contract, status="confirmed", gas_used=52100,
                              block_timestamp=_dt("2026-04-11T08:20:15")),
        BlockchainTransaction(tx_hash="0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
                              evidence_id=e4.evidence_id, initiated_by=officer_id,
                              action_type=BlockchainAction.REGISTER, block_number=18245102,
                              contract_address=contract, status="confirmed", gas_used=53200,
                              block_timestamp=_dt("2026-04-22T16:01:00")),
        BlockchainTransaction(tx_hash="0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
                              evidence_id=e1.evidence_id, initiated_by=officer_id,
                              action_type=BlockchainAction.VERIFY, block_number=18250100,
                              contract_address=contract, status="confirmed", gas_used=31500,
                              block_timestamp=_dt("2026-04-15T09:00:00")),
        BlockchainTransaction(tx_hash="0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a",
                              evidence_id=e3.evidence_id, initiated_by=officer_id,
                              action_type=BlockchainAction.REGISTER, block_number=18251000,
                              contract_address=contract, status="pending", gas_used=0,
                              block_timestamp=_dt("2026-04-12T09:01:00")),
    ]
    db.add_all(txs)

    # ── access logs ─────────────────────────────────────
    logs = [
        AccessLog(user_id=somsak.user_id, evidence_id=e1.evidence_id, action=AuditAction.VIEW,
                  action_type="view", ip_address="192.168.1.45", user_agent="Chrome/125",
                  result=AuditResult.SUCCESS, accessed_at=_dt("2026-04-12T10:30:00")),
        AccessLog(user_id=officer_id, evidence_id=e1.evidence_id, action=AuditAction.VIEW,
                  action_type="download", ip_address="192.168.1.20", user_agent="Chrome/125",
                  result=AuditResult.SUCCESS, accessed_at=_dt("2026-04-13T18:00:00")),
        AccessLog(user_id=wichai.user_id, evidence_id=e2.evidence_id, action=AuditAction.VIEW,
                  action_type="view", ip_address="10.0.0.55", user_agent="Firefox/130",
                  result=AuditResult.FAILED, accessed_at=_dt("2026-04-14T16:15:00")),
        AccessLog(user_id=officer_id, evidence_id=e4.evidence_id, action=AuditAction.VIEW,
                  action_type="view", ip_address="192.168.1.20", user_agent="Chrome/125",
                  result=AuditResult.SUCCESS, accessed_at=_dt("2026-04-23T15:00:00")),
        AccessLog(user_id=somsak.user_id, evidence_id=e4.evidence_id, action=AuditAction.VIEW,
                  action_type="print", ip_address="192.168.1.45", user_agent="Chrome/125",
                  result=AuditResult.SUCCESS, accessed_at=_dt("2026-04-24T21:00:00")),
    ]
    db.add_all(logs)

    # ── ไฟล์หลักฐาน (ตัวอย่างสำหรับ e1) ─────────────────
    f1 = EvidenceFile(
        evidence_id=e1.evidence_id, file_type=FileType.IMAGE,
        file_path="/storage/2026/04/scene_001.jpg",
        file_url="https://picsum.photos/seed/EV-2026-00101/800/600",
        mime_type="image/jpeg", file_size_bytes=4200000,
        file_hash="a3f2c8d1e5b94f7a6c0d3e8b1f4a7c2d5e8b0f3a6c9d2e5b8a1c4f7d0e3b6a9c",
        is_original=True, version=1, created_at=_dt("2026-04-11T08:15:00"),
    )
    db.add(f1)
    db.flush()

    # ── chain of custody ของ e1 ─────────────────────────
    db.add_all([
        CustodyEvent(evidence_id=e1.evidence_id, action=CustodyAction.COLLECTED,
                     from_user_id=None, to_user_id=officer_id,
                     location="จุดเกิดเหตุ ซ.สุขุมวิท 23", notes="เก็บหลักฐานจากที่เกิดเหตุ",
                     occurred_at=_dt("2026-04-10T14:25:00")),
        CustodyEvent(evidence_id=e1.evidence_id, action=CustodyAction.CHECKED_IN,
                     from_user_id=officer_id, to_user_id=officer_id,
                     location="คลังหลักฐาน กองพิสูจน์หลักฐาน", notes="นำเข้าคลังหลังอัปโหลด",
                     occurred_at=_dt("2026-04-11T08:30:00")),
        CustodyEvent(evidence_id=e1.evidence_id, action=CustodyAction.CHECKED_OUT,
                     from_user_id=officer_id, to_user_id=somsak.user_id,
                     location="ห้องตรวจพิสูจน์", notes="เบิกเพื่อตรวจสอบลายน้ำ",
                     occurred_at=_dt("2026-04-15T08:45:00")),
    ])

    # ── ประวัติตรวจ integrity ของไฟล์ e1 ────────────────
    db.add(IntegrityCheck(
        evidence_file_id=f1.file_id, checked_by=officer_id,
        expected_hash=f1.file_hash, computed_hash=f1.file_hash, is_match=True,
        notes="ตรวจความสมบูรณ์ตอนยืนยันหลักฐาน", checked_at=_dt("2026-04-15T09:00:00"),
    ))

    db.commit()
    db.close()
    print("[OK] Sample data seeded")
