import os
import re

from langchain_core.tools import tool

from app.ingestion.repo_loader import traverse_repo

_REPO_PATH = None
_VECTOR_STORE = None


def set_repo_context(repo_path: str, vector_store) -> None:
    global _REPO_PATH, _VECTOR_STORE
    _REPO_PATH = repo_path
    _VECTOR_STORE = vector_store


def _resolve_path(relative_path: str) -> str | None:
    full = os.path.normpath(os.path.join(_REPO_PATH, relative_path))
    repo_real = os.path.realpath(_REPO_PATH)
    full_real = os.path.realpath(full)
    if not full_real.startswith(repo_real):
        return None
    return full


@tool
def list_files(directory_path: str) -> str:
    """List immediate files and folders in a directory within the cloned repo (non-recursive)."""
    if _REPO_PATH is None:
        return "Error: no repo context set."
    full_path = _resolve_path(directory_path)
    if full_path is None:
        return f"Error: path outside repo: {directory_path}"
    if not os.path.isdir(full_path):
        return f"Error: directory not found: {directory_path}"
    try:
        entries = sorted(os.listdir(full_path))
    except OSError as e:
        return f"Error listing directory: {e}"
    lines = []
    for name in entries:
        child = os.path.join(full_path, name)
        if os.path.isdir(child):
            lines.append(f"{name}/")
        else:
            lines.append(name)
    if not lines:
        return "(empty directory)"
    return "\n".join(lines)


@tool
def read_file(file_path: str) -> str:
    """Read the content of a file from the cloned repo (capped at 3000 characters)."""
    if _REPO_PATH is None:
        return "Error: no repo context set."
    full_path = _resolve_path(file_path)
    if full_path is None:
        return f"Error: path outside repo: {file_path}"
    if not os.path.isfile(full_path):
        return f"Error: file not found: {file_path}"
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError as e:
        return f"Error reading file: {e}"
    max_chars = 3000
    if len(content) > max_chars:
        truncated = content[:max_chars]
        truncated += f"\n\n... (truncated, full file is {len(content)} characters)"
        return truncated
    return content


@tool
def search_codebase(query: str) -> str:
    """Semantically search the codebase using the vector index. Returns up to 5 matching chunks with their source file paths."""
    if _VECTOR_STORE is None:
        return "Error: vector store not initialized."
    results = _VECTOR_STORE.similarity_search(query, k=5)
    if not results:
        return "No matching results found."
    lines = []
    for i, doc in enumerate(results, 1):
        source = doc.metadata.get("source", "unknown")
        lines.append(f"--- Result {i} (source: {source}) ---")
        lines.append(doc.page_content.strip())
    return "\n\n".join(lines)


@tool
def grep_pattern(pattern: str) -> str:
    """Search for a regex pattern in all files of the cloned repo. Returns matching file paths with the matching line."""
    if _REPO_PATH is None:
        return "Error: no repo context set."
    file_paths = traverse_repo(_REPO_PATH)
    matches = []
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        return f"Invalid regex pattern: {e}"
    for fp in file_paths:
        relative = fp.replace(_REPO_PATH, "").lstrip("/")
        try:
            with open(fp, "r", encoding="utf-8", errors="replace") as f:
                for line_no, line in enumerate(f, 1):
                    if compiled.search(line):
                        matches.append(f"{relative}:{line_no}: {line.rstrip()}")
        except OSError:
            continue
        if len(matches) > 100:
            matches.append("... (too many matches, stopping at 100)")
            break
    if not matches:
        return f"No matches found for pattern: {pattern}"
    return "\n".join(matches)
