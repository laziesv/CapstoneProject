from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
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


# ── Root ────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "message": "Digital Evidence API Running"
    }
