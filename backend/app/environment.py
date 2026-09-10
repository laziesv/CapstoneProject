"""Load backend environment variables from a stable location."""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
BACKEND_ENV_PATH = BACKEND_DIR / ".env"


@lru_cache(maxsize=1)
def load_backend_environment() -> bool:
    # โหลดไฟล์ตั้งค่าจาก backend โดยตรง เพื่อให้ผลไม่ขึ้นกับ working directory
    return load_dotenv(dotenv_path=BACKEND_ENV_PATH, override=False)
