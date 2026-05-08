from fastapi import FastAPI
from sqlalchemy import text

from app.database import Base, engine
from app.models import *


app = FastAPI()


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


@app.get("/")
def root():
    return {
        "message": "Digital Evidence API Running"
    }