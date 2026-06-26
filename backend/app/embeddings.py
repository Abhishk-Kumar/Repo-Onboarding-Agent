import threading

from langchain_huggingface import HuggingFaceEmbeddings
from app.config import settings

_embeddings_instance: HuggingFaceEmbeddings | None = None
_embeddings_lock = threading.Lock()


def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings_instance
    if _embeddings_instance is None:
        with _embeddings_lock:
            if _embeddings_instance is None:
                _embeddings_instance = HuggingFaceEmbeddings(
                    model_name=settings.embedding_model,
                    model_kwargs={"device": "cpu"},
                    encode_kwargs={"device": "cpu"},
                )
    return _embeddings_instance


def reset_embeddings() -> None:
    global _embeddings_instance
    _embeddings_instance = None
