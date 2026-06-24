from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mistral_api_key: str = ""
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    vector_store_path: str = "data/chroma_db"
    clone_temp_dir: str = "data/repos"

    mistral_retry_max_attempts: int = 3
    mistral_retry_initial_delay: float = 1.0
    mistral_retry_max_delay: float = 16.0

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
