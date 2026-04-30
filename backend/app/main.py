from fastapi import FastAPI
from app.routes import api

app = FastAPI()

# include routes
app.include_router(api.router)