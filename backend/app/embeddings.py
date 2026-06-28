import threading
import logging
import hashlib

logger = logging.getLogger(__name__)

_embeddings_instance = None
_embeddings_lock = threading.Lock()


class _HuggingFaceAPIEmbeddings:
    """Uses HuggingFace's free Inference API (no local model, no API key needed)."""

    API_URL = (
        "https://api-inference.huggingface.co/pipeline/feature-extraction/"
        "sentence-transformers/all-MiniLM-L6-v2"
    )

    def embed_documents(self, texts):
        import requests
        resp = requests.post(
            self.API_URL,
            json={"inputs": texts, "options": {"wait_for_model": True}},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()

    def embed_query(self, text):
        return self.embed_documents([text])[0]


class _SimpleEmbeddings:
    """Zero-dependency fallback when API is unavailable. Quality is basic."""

    DIM = 128

    def embed_documents(self, texts):
        result = []
        for text in texts:
            h = hashlib.sha256(text.encode()).digest()
            result.append([b / 255.0 for b in h[:self.DIM]])
        return result

    def embed_query(self, text):
        return self.embed_documents([text])[0]


def get_embeddings():
    global _embeddings_instance
    if _embeddings_instance is None:
        with _embeddings_lock:
            if _embeddings_instance is None:
                logger.info("Using simple embeddings (no external API calls).")
                _embeddings_instance = _SimpleEmbeddings()
    return _embeddings_instance


def reset_embeddings() -> None:
    global _embeddings_instance
    _embeddings_instance = None
