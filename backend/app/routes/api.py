from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def root():
    return {"message": "Backend is running"}

# ตัวอย่าง endpoint สำหรับ ESP32 ส่งข้อมูล
@router.post("/data")
def receive_data(temp: float, humidity: float):
    return {
        "status": "received",
        "temperature": temp,
        "humidity": humidity
    }