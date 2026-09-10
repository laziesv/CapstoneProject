import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context


# ─────────────────────────────────────
# เพิ่ม backend เข้า sys.path
# ─────────────────────────────────────
sys.path.insert(
    0,
    os.path.dirname(os.path.dirname(__file__))
)


# ─────────────────────────────────────
# Import database และ models
# ─────────────────────────────────────
from app.database import Base, DATABASE_URL  # noqa: E402
from app.models import *  # noqa: F401,F403,E402


# ─────────────────────────────────────
# Alembic Config
# ─────────────────────────────────────
config = context.config


# ใช้ DATABASE_URL จาก app.database
config.set_main_option(
    "sqlalchemy.url",
    DATABASE_URL
)


# ─────────────────────────────────────
# Logging
# ─────────────────────────────────────
if config.config_file_name is not None:
    fileConfig(
        config.config_file_name,
        disable_existing_loggers=False
    )


# ─────────────────────────────────────
# Metadata สำหรับ autogenerate
# ─────────────────────────────────────
target_metadata = Base.metadata


_LEGACY_COLUMNS = {
    ("cases", "status"),
    ("cases", "legal_hold"),
    ("cases", "retention_until"),
    ("cases", "is_deleted"),
    ("evidence_items", "category"),
    ("evidence_items", "file_hash_sha256"),
    ("evidence_items", "status"),
    ("evidence_items", "legal_hold"),
    ("evidence_items", "retention_until"),
    ("evidence_items", "is_deleted"),
    ("evidence_items", "deleted_at"),
    ("evidence_files", "mime_type"),
    ("evidence_files", "is_original"),
    ("evidence_files", "version"),
    ("access_logs", "action_type"),
    ("access_logs", "reason"),
    ("watermark_records", "algorithm"),
    ("watermark_records", "verification_score"),
}

_LEGACY_INDEXES = {
    "ix_cases_status",
    "ix_cases_is_deleted",
    "ix_evidence_items_file_hash_sha256",
    "ix_evidence_items_status",
    "ix_evidence_items_is_deleted",
}


def include_object(object_, name, type_, reflected, compare_to):
    # รักษาคอลัมน์และดัชนีเดิมของทีมไว้ ไม่ให้ autogenerate เสนอการลบข้อมูล
    if reflected and compare_to is None and type_ == "column":
        return (object_.table.name, name) not in _LEGACY_COLUMNS
    if reflected and compare_to is None and type_ == "index":
        return name not in _LEGACY_INDEXES
    return True



# ─────────────────────────────────────
# Offline migration
# ─────────────────────────────────────
def run_migrations_offline() -> None:

    url = config.get_main_option(
        "sqlalchemy.url"
    )

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={
            "paramstyle": "named"
        },
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()



# ─────────────────────────────────────
# Online migration
# ─────────────────────────────────────
def run_migrations_online() -> None:

    connectable = engine_from_config(
        config.get_section(
            config.config_ini_section,
            {}
        ),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )


    with connectable.connect() as connection:

        context.configure(
            connection=connection,
            target_metadata=target_metadata,

            # สำคัญสำหรับ PostgreSQL
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
        )


        with context.begin_transaction():
            context.run_migrations()



# ─────────────────────────────────────
# Run
# ─────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
