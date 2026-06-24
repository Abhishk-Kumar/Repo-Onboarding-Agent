import time
import logging
import concurrent.futures
import threading

from app.config import settings

logger = logging.getLogger(__name__)

_llm_instance = None
_llm_lock = threading.Lock()
_llm_provider = None


def _build_groq():
    from langchain_groq import ChatGroq
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
        max_retries=0,
        timeout=30,
    ), "groq"


def _build_mistral():
    from langchain_mistralai import ChatMistralAI
    return ChatMistralAI(
        model="mistral-small-latest",
        temperature=0,
        max_retries=0,
        timeout=30,
    ), "mistral"


def get_llm():
    global _llm_instance, _llm_provider
    if _llm_instance is None:
        with _llm_lock:
            if _llm_instance is None:
                try:
                    _llm_instance, _llm_provider = _build_groq()
                    logger.info("Using Groq LLM provider (%s)", _llm_instance.model)
                except Exception as e:
                    logger.warning("Groq init failed: %s. Falling back to Mistral.", e)
                    _llm_instance, _llm_provider = _build_mistral()
                    logger.info("Using Mistral LLM provider (%s)", _llm_instance.model)
    return _llm_instance


def get_llm_provider() -> str:
    get_llm()
    return _llm_provider


def reset_llm() -> None:
    global _llm_instance, _llm_provider
    _llm_instance = None
    _llm_provider = None


def call_llm_with_retry(chain, inputs: dict, hard_timeout: int = 30) -> str:
    last_error = None
    delay = settings.mistral_retry_initial_delay
    provider = get_llm_provider()

    for attempt in range(settings.mistral_retry_max_attempts):
        try:
            logger.info("[%s] LLM call attempt %d/%d...", provider, attempt + 1, settings.mistral_retry_max_attempts)
            t0 = time.time()

            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            future = executor.submit(chain.invoke, inputs)
            result = future.result(timeout=hard_timeout)
            executor.shutdown(wait=False)

            elapsed = round(time.time() - t0, 2)
            logger.info("[%s] LLM call succeeded in %.2fs", provider, elapsed)
            return result

        except concurrent.futures.TimeoutError:
            elapsed = round(time.time() - t0, 2) if 't0' in dir() else -1
            logger.warning(
                "[%s] LLM call TIMED OUT after %.2fs (attempt %d/%d, hard timeout=%ds).",
                provider, elapsed, attempt + 1, settings.mistral_retry_max_attempts, hard_timeout,
            )
            last_error = TimeoutError(f"LLM call timed out after {hard_timeout}s")

            if attempt < settings.mistral_retry_max_attempts - 1:
                logger.warning("[%s] Retrying in %.1fs...", provider, delay)
                time.sleep(delay)
                delay = min(delay * 2, settings.mistral_retry_max_delay)
                continue

            raise last_error

        except Exception as e:
            last_error = e
            elapsed = round(time.time() - t0, 2) if 't0' in dir() else -1
            error_str = str(e).lower()
            is_rate_limit = "429" in error_str or "rate limit" in error_str
            is_server_error = "500" in error_str or "502" in error_str or "503" in error_str

            # On auth/rate-limit errors with Groq, try Mistral as fallback
            if provider == "groq" and (is_rate_limit or "auth" in error_str or "unauthorized" in error_str or "401" in error_str):
                logger.warning("[groq] Provider error: %s. Falling back to Mistral.", e)
                _switch_to_mistral()
                provider = "mistral"
                attempt -= 1
                continue

            if is_rate_limit or is_server_error:
                if attempt < settings.mistral_retry_max_attempts - 1:
                    logger.warning(
                        "[%s] LLM call failed (attempt %d/%d) in %.2fs: %s. Retrying in %.1fs...",
                        provider, attempt + 1, settings.mistral_retry_max_attempts,
                        elapsed, e, delay,
                    )
                    time.sleep(delay)
                    delay = min(delay * 2, settings.mistral_retry_max_delay)
                    continue

            logger.error("[%s] LLM call failed (non-retryable) in %.2fs: %s", provider, elapsed, e)
            raise

    raise last_error


def _switch_to_mistral():
    global _llm_instance, _llm_provider
    with _llm_lock:
        _llm_instance, _llm_provider = _build_mistral()
        logger.info("Switched to Mistral LLM provider")
