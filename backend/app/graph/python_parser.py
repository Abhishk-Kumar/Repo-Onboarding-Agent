import ast
import os
import logging

logger = logging.getLogger(__name__)

STDLIB_PACKAGES = {
    "os", "sys", "re", "json", "math", "time", "datetime", "collections",
    "itertools", "functools", "pathlib", "typing", "uuid", "hashlib",
    "logging", "argparse", "subprocess", "threading", "multiprocessing",
    "io", "base64", "abc", "enum", "dataclasses", "inspect", "pprint",
    "random", "statistics", "string", "textwrap", "types", "warnings",
    "weakref", "copy", "decimal", "fractions", "numbers", "contextlib",
    "importlib", "pkgutil", "platform", "shutil", "tempfile", "glob",
    "fnmatch", "linecache", "pickle", "shelve", "marshal", "smtplib",
    "email", "http", "urllib", "xml", "html", "cgi", "webbrowser",
    "asyncio", "signal", "socket", "ssl", "select", "selectors",
    "unittest", "doctest", "traceback", "pdb", "profile", "cProfile",
    "tokenize", "token", "keyword", "ast", "compileall", "dis",
    "builtins", "__future__",
}


def _is_stdlib_or_third_party(module_name: str) -> bool:
    top = module_name.split(".")[0]
    if top in STDLIB_PACKAGES:
        return True
    if top.startswith("_"):
        return True
    return False


def _resolve_import(node: ast.Import | ast.ImportFrom, file_path: str, repo_root: str) -> list[dict]:
    resolved = []
    file_dir = os.path.dirname(os.path.abspath(file_path))

    if isinstance(node, ast.Import):
        for alias in node.names:
            module = alias.name
            if _is_stdlib_or_third_party(module):
                continue
            resolved_module = _try_resolve(module, file_dir, repo_root)
            if resolved_module:
                resolved.append(resolved_module)
    elif isinstance(node, ast.ImportFrom):
        module = node.module or ""
        if _is_stdlib_or_third_party(module):
            return []
        for alias in node.names:
            name = alias.name
            resolved_module = _try_resolve(f"{module}.{name}", file_dir, repo_root) if module else _try_resolve(name, file_dir, repo_root)
            if resolved_module:
                resolved.append(resolved_module)
            else:
                if module:
                    pkg_path = _try_resolve(module, file_dir, repo_root)
                    if pkg_path:
                        resolved.append(pkg_path)

    return resolved


def _try_resolve(module: str, file_dir: str, repo_root: str) -> dict | None:
    parts = module.split(".")
    candidates = []

    rel_path = os.path.join(file_dir, *parts[:-1], parts[-1] + ".py")
    candidates.append(rel_path)
    rel_init = os.path.join(file_dir, *parts, "__init__.py")
    candidates.append(rel_init)
    rel_path_so = os.path.join(file_dir, *parts)
    candidates.append(rel_path_so)

    for candidate in candidates:
        candidate = os.path.normpath(candidate)
        if os.path.isfile(candidate):
            try:
                relative = os.path.relpath(candidate, repo_root)
                return {"source": module, "resolved_path": relative}
            except ValueError:
                return None

    alt_base = os.path.join(repo_root, *parts[:-1], parts[-1] + ".py")
    if os.path.isfile(alt_base):
        try:
            relative = os.path.relpath(alt_base, repo_root)
            return {"source": module, "resolved_path": relative}
        except ValueError:
            return None

    alt_init = os.path.join(repo_root, *parts, "__init__.py")
    if os.path.isfile(alt_init):
        try:
            relative = os.path.relpath(alt_init, repo_root)
            return {"source": module, "resolved_path": relative}
        except ValueError:
            return None

    return None


def parse_python_imports(file_path: str, repo_root: str) -> list[dict]:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    imports = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            resolved = _resolve_import(node, file_path, repo_root)
            imports.extend(resolved)

    return imports


def parse_python_defs(file_path: str) -> dict:
    result = {"functions": [], "classes": []}
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return result

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return result

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            result["functions"].append(node.name)
        elif isinstance(node, ast.ClassDef):
            result["classes"].append(node.name)

    return result


def find_flask_fastapi_routes(file_path: str) -> list[dict]:
    routes = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return routes

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return routes

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and hasattr(decorator.func, "attr"):
                    if decorator.func.attr in ("get", "post", "put", "delete", "patch"):
                        method = decorator.func.attr.upper()
                        if decorator.args:
                            try:
                                path = ast.literal_eval(decorator.args[0])
                                routes.append({
                                    "method": method,
                                    "path": path,
                                    "function": node.name,
                                })
                            except (ValueError, TypeError):
                                pass

    return routes
