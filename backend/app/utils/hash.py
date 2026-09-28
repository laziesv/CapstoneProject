import hashlib



def calculate_sha256(path: str):

    sha256 = hashlib.sha256()


    with open(path, "rb") as file:

        while chunk := file.read(1024 * 1024):

            sha256.update(chunk)


    return sha256.hexdigest()


def static_watermark_hash(evidence_id) -> str:
    """ค่าที่ฝังใน Static Watermark ของหลักฐาน — ต้องตรงกับ embed_static() ใน mainyy.py"""

    return hashlib.sha256(str(evidence_id).encode("utf-8")).hexdigest()
