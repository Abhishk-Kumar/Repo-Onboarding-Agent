import os
import hashlib
import logging

logger = logging.getLogger(__name__)


def _repo_cache_key(repo_url: str) -> str:
    return hashlib.sha256(repo_url.encode()).hexdigest()[:16]


def _cache_path(repo_url: str) -> str:
    from app.config import settings
    key = _repo_cache_key(repo_url)
    return os.path.join(settings.vector_store_path, key)


def build_vector_store(documents, repo_url: str):
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    from app.embeddings import get_embeddings

    embeddings = get_embeddings()

    cache_dir = _cache_path(repo_url)

    if os.path.exists(cache_dir) and os.listdir(cache_dir):
        logger.info("Reusing cached vector store for %s at %s", repo_url, cache_dir)
        return Chroma(
            persist_directory=cache_dir,
            embedding_function=embeddings,
        )

    logger.info("Building new vector store for %s at %s", repo_url, cache_dir)
    os.makedirs(cache_dir, exist_ok=True)

    vectorstore = Chroma.from_documents(
        documents,
        embeddings,
        persist_directory=cache_dir,
    )
    return vectorstore


def get_vector_store(repo_url: str):
    from langchain_chroma import Chroma
    from app.embeddings import get_embeddings

    cache_dir = _cache_path(repo_url)
    if not os.path.exists(cache_dir) or not os.listdir(cache_dir):
        return None
    return Chroma(
        persist_directory=cache_dir,
        embedding_function=get_embeddings(),
    )
