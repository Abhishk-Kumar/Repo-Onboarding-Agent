import os
import re
import logging

logger = logging.getLogger(__name__)

IGNORE_DIRS = {".git", "node_modules", "__pycache__", "venv", ".venv", "dist", "build", ".next"}

ENTRY_POINT_PATTERNS = [
    re.compile(r, re.IGNORECASE) for r in [
        r"^main\.(py|js|ts|go|java)$",
        r"^app\.(py|js|ts)$",
        r"^index\.(js|ts|jsx|tsx|html)$",
        r"^server\.(py|js|ts)$",
        r"^cli\.(py|js|ts)$",
        r"^(run|start)\.(py|sh)$",
    ]
]

SECRET_PATTERNS = [
    re.compile(p) for p in [
        r'(?i)(password|passwd|pwd|secret|api_key|apikey)\s*[:=]\s*["\'][^"\']+["\']',
        r'(?i)(-----BEGIN (RSA |EC )?PRIVATE KEY-----)',
        r'(?i)ghp_[a-zA-Z0-9]{36}',
        r'(?i)sk-[a-zA-Z0-9]{20,}',
        r'(?i)AKIA[0-9A-Z]{16}',
    ]
]

CONFIG_FILE_NAMES = {
    "pyproject.toml", "package.json", "Cargo.toml", "go.mod",
    "requirements.txt", "Makefile", "Dockerfile", "docker-compose.yml",
    ".env.example", "README.md", "README.rst", "index.html",
    "tsconfig.json", "vite.config.js", "vite.config.ts",
    "next.config.js", "webpack.config.js",
}

EXTRA_README_NAMES = {"README.md", "README.rst", "CONTRIBUTING.md"}


def explore_codebase(repo_path: str) -> dict:
    config_files = {}
    entry_points = []
    todos = []
    secrets = []
    fixmes = []
    language_extensions = set()
    total_files = 0
    structure_lines = []
    repo_name = os.path.basename(repo_path)
    structure_lines.append(f"{repo_name}/")

    key_contents = {}

    def _walk(dirpath, depth):
        nonlocal total_files
        if depth > 4:
            return
        try:
            entries = sorted(os.listdir(dirpath))
        except OSError:
            return

        for name in entries:
            if name.startswith(".") and name not in CONFIG_FILE_NAMES:
                continue
            if name == "node_modules":
                continue

            full = os.path.join(dirpath, name)
            indent = "  " * depth

            if os.path.isdir(full):
                if name not in IGNORE_DIRS:
                    structure_lines.append(f"{indent}{name}/")
                    _walk(full, depth + 1)
                continue

            structure_lines.append(f"{indent}{name}")
            ext = os.path.splitext(name)[1]
            if ext:
                language_extensions.add(ext)
            total_files += 1

            rel_path = os.path.relpath(full, repo_path)

            # Check entry point patterns
            if any(p.match(name) for p in ENTRY_POINT_PATTERNS):
                entry_points.append({"path": rel_path, "type": "entry_point"})
                _read_key_file(full, rel_path, key_contents)

            # Read config files
            if name in CONFIG_FILE_NAMES:
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        config_files[name] = f.read(2000)
                except OSError:
                    pass

            # Scan for TODOs, FIXMEs, secrets
            try:
                with open(full, "r", encoding="utf-8", errors="replace") as f:
                    for i, line in enumerate(f, 1):
                        line_lower = line.lower()
                        if "todo" in line_lower:
                            todos.append(f"{rel_path}:{i}: {line.strip()[:120]}")
                        if "fixme" in line_lower:
                            fixmes.append(f"{rel_path}:{i}: {line.strip()[:120]}")
                        for sp in SECRET_PATTERNS:
                            if sp.search(line):
                                secrets.append(f"{rel_path}:{i}: <redacted>")
                                break
            except (OSError, UnicodeDecodeError):
                pass

    _walk(repo_path, 1)

    # Fallback: read README if not already captured
    for rname in EXTRA_README_NAMES:
        path = os.path.join(repo_path, rname)
        if os.path.isfile(path) and rname not in config_files:
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    config_files[rname] = f.read(2000)
            except OSError:
                pass

    return {
        "structure": "\n".join(structure_lines),
        "config_files": config_files,
        "entry_points": entry_points,
        "todos": todos[:30],
        "secrets": secrets[:20],
        "fixmes": fixmes[:20],
        "key_file_contents": key_contents,
        "language_breakdown": sorted(language_extensions),
        "total_files": total_files,
    }


def _read_key_file(full_path: str, rel_path: str, store: dict) -> None:
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            store[rel_path] = f.read(3000)
    except OSError:
        pass
