from pydantic import BaseModel


class IntegrityMismatch(BaseModel):
    """ค่าที่ต่างกันระหว่างข้อมูลแก้ไขได้ใน DB กับหลักฐานบน Blockchain"""

    field: str
    database_value: str | int | bool | None
    blockchain_value: str | int | bool | None
