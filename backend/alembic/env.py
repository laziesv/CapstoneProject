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