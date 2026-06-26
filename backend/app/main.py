import logging
import sys
import threading

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.onboard import router as onboard_router
from app.config import settings
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

app.mount("/", StaticFiles(directory="static", html=True, name="static"))

@app.on_event("startup")
async def startup():
    logger.info("Starting Codebase Onboarding Agent v3...")
    logger.info("Embedding model: %s", settings.embedding_model)
    logger.info("Vector store path: %s", settings.vector_store_path)

    def _preload():
        try:
            from app.embeddings import get_embeddings
            logger.info("Pre-loading embedding model in background...")
            get_embeddings()
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.warning("Embedding model pre-load failed: %s. Will load on first request.", e)

    threading.Thread(target=_preload, daemon=True).start()
    logger.info("Server ready (model loading in background)")
