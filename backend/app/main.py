from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, engine
from app.models import *
from app.routes.auth import router as auth_router


app = FastAPI(title="DEVA API", version="1.0.0")

# ── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def test_database_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        print("✅ Database connected")

    except Exception as e:
        print("❌ Database connection failed")
        print(e)


# Test database
test_database_connection()

# Create tables
Base.metadata.create_all(bind=engine)

# ── Routers ──────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")


@app.get("/")
def root():
    return {
        "message": "Digital Evidence API Running"
    }