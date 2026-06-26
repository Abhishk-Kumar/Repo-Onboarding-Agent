import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.onboard import router as onboard_router
from app.config import settings
import os
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Codebase Onboarding Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboard_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

@app.on_event("startup")
async def startup():
    logger.info("Starting Codebase Onboarding Agent v3...")
    logger.info("Embedding model: %s", settings.embedding_model)
    logger.info("Vector store path: %s", settings.vector_store_path)
    logger.info("Server ready (model loads on first request)")
