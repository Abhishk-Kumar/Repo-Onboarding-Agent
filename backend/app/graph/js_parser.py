import os
import re
import logging

logger = logging.getLogger(__name__)

IMPORT_PATTERNS = [
    re.compile(r'import\s+[\s\S]*?\s+from\s+["\'](.+?)["\']'),
    re.compile(r'const\s+\w+\s*=\s*require\(["\'](.+?)["\']\)'),
    re.compile(r'let\s+\w+\s*=\s*require\(["\'](.+?)["\']\)'),
    re.compile(r'var\s+\w+\s*=\s*require\(["\'](.+?)["\']\)'),
    re.compile(r'import\(["\'](.+?)["\']\)'),
    re.compile(r'export\s+\{[\s\S]*?\}\s+from\s+["\'](.+?)["\']'),
    re.compile(r'export\s+\*\s+from\s+["\'](.+?)["\']'),
]

JS_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}

NODE_BUILTINS = {
    "fs", "path", "os", "http", "https", "util", "events", "stream",
    "crypto", "buffer", "child_process", "cluster", "dns", "net",
    "tls", "url", "querystring", "zlib", "assert", "console", "module",
    "process", "timers", "string_decoder", "readline", "repl", "vm",
    "worker_threads", "perf_hooks", "async_hooks", "v8", "inspector",
    "diagnostics_channel", "domain", "punycode", "tty",
}


def _is_external_or_builtin(module_spec: str) -> bool:
    if not module_spec.startswith(".") and not module_spec.startswith("/"):
        return True
    return False


def _normalize_relative(module_spec: str, file_dir: str) -> str:
    result = os.path.normpath(os.path.join(file_dir, module_spec))
    return result


def _try_extension(base_path: str) -> str | None:
    for ext in JS_EXTENSIONS:
        candidate = base_path + ext
        if os.path.isfile(candidate):
            return candidate
    if os.path.isdir(base_path):
        for ext in JS_EXTENSIONS:
            candidate = os.path.join(base_path, "index" + ext)
            if os.path.isfile(candidate):
                return candidate
    return None


def _resolve_js_import(module_spec: str, file_path: str, repo_root: str) -> dict | None:
    if _is_external_or_builtin(module_spec):
        top = module_spec.split("/")[0].split("@")[0] if module_spec.startswith("@") else module_spec.split("/")[0]
        if top in NODE_BUILTINS:
            return None
        return {"source": module_spec, "resolved_path": None, "external": True}

    file_dir = os.path.dirname(os.path.abspath(file_path))
    base_path = _normalize_relative(module_spec, file_dir)
    resolved = _try_extension(base_path)

    if resolved and os.path.exists(resolved):
        try:
            relative = os.path.relpath(resolved, repo_root)
            return {"source": module_spec, "resolved_path": relative, "external": False}
        except ValueError:
            return None

    return None


def parse_js_imports(file_path: str, repo_root: str) -> list[dict]:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return []

    imports = []
    seen = set()

    for pattern in IMPORT_PATTERNS:
        for match in pattern.finditer(content):
            module_spec = match.group(1).strip()
            if module_spec in seen:
                continue
            seen.add(module_spec)
            resolved = _resolve_js_import(module_spec, file_path, repo_root)
            if resolved:
                imports.append(resolved)

    return imports


EXPRESS_ROUTE_PATTERNS = [
    re.compile(r'\.(get|post|put|delete|patch|all)\s*\(\s*["\'](.+?)["\']'),
    re.compile(r'router\.(get|post|put|delete|patch|all)\s*\(\s*["\'](.+?)["\']'),
    re.compile(r'(?:app|router)\.route\s*\(\s*["\'](.+?)["\']\)'),
]


def find_express_routes(file_path: str) -> list[dict]:
    routes = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return routes

    for pattern in EXPRESS_ROUTE_PATTERNS:
        for match in pattern.finditer(content):
            if pattern.groups == 2:
                method = match.group(1).upper()
                path = match.group(2)
            else:
                method = "ANY"
                path = match.group(1)
            routes.append({
                "method": method,
                "path": path,
                "function": "",
                "framework": "express",
            })

    return routes
