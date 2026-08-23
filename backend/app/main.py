from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.users import router as users_router
from app.routes.case import router as cases_router
from app.routes.evidence_items import router as evidence_items_router
from app.routes.evidence_files import router as evidence_files_router
from app.routes.watermark import router as watermark_router
from app.routes.access_logs import router as access_logs_router
from app.core.startup import startup


app = FastAPI(
    title="DEVA API",
    version="1.0.0"
)

# ── CORS ────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ─────────────────────────────────────────────
startup()

# ── Routers ─────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(evidence_items_router, prefix="/api")
app.include_router(evidence_files_router, prefix="/api")
app.include_router(watermark_router, prefix="/api")
app.include_router(access_logs_router, prefix="/api")



# ── Root ────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "message": "Digital Evidence API Running"
    }
