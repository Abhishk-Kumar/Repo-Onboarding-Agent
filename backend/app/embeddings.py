import threading

from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

_embeddings_instance = None
_embeddings_lock = threading.Lock()


class _ONNXEmbeddings:
    """LangChain-compatible embedding wrapper using ChromaDB's ONNX model.
    No torch dependency — uses ONNX runtime (~50MB vs ~300MB).
    """

    def __init__(self):
        self._model = ONNXMiniLM_L6_V2()

    def embed_documents(self, texts):
        return self._model(texts)

    def embed_query(self, text):
        return self._model([text])[0]


def get_embeddings():
    global _embeddings_instance
    if _embeddings_instance is None:
        with _embeddings_lock:
            if _embeddings_instance is None:
                _embeddings_instance = _ONNXEmbeddings()
    return _embeddings_instance


def reset_embeddings() -> None:
    global _embeddings_instance
    _embeddings_instance = None
