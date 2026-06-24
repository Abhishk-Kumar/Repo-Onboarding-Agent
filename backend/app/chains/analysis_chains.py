import json
import re
import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.models.schemas import CodebaseAnalysis
from app.llm import get_llm, call_llm_with_retry

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> dict:
    text = text.strip()

    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if json_match:
        text = json_match.group(1).strip()

    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()

    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        text = text[brace_start : brace_end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("JSON decode error: %s. Raw text (first 500 chars): %s", e, text[:500])
        raise


def build_analysis_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a senior software engineer analyzing a codebase. "
            "Based on the exploration findings below, produce a comprehensive report.\n\n"
            "You MUST respond with valid JSON only. No markdown, no explanation, no code fences.\n\n"
            "JSON schema:\n"
            "{{\n"
            '  "architecture_summary": "2-4 paragraphs describing frameworks, folder structure, request flow, module connections",\n'
            '  "entry_points": ["path/file.py: explanation why it matters", ...],\n'
            '  "gotchas": ["potential issue description", ...],\n'
            '  "mermaid_diagram": "graph TD;\\n  A[main] --> B[module];",\n'
            '  "direct_answer": "answer or null if no question asked"\n'
            "}}\n\n"
            "RULES:\n"
            "- architecture_summary: 2-4 paragraphs describing frameworks, folder structure, request flow, module connections.\n"
            "- entry_points: List of 3-5 most important files to read first, each with a one-line explanation.\n"
            "- gotchas: List of potential issues (TODOs, FIXMEs, hardcoded secrets, fragile patterns, missing error handling). If nothing concerning, list [\"No significant issues found.\"]\n"
            "- mermaid_diagram: Mermaid flowchart showing module structure. Use ONLY this syntax:\n"
            "  graph TD;\n"
            "    Node1[Label] --> Node2[Label]\n"
            "    Node1 -->|edge label| Node3[Label]\n"
            "  RULES: (a) start with 'graph TD;' (b) each node name is alphanumeric (no spaces, hyphens, dots) (c) labels in [] only (d) labels on | | only (e) arrows use ONLY --> (f) NEVER use > after --> (g) NO markdown fences (h) max 20 lines.\n"
            "- direct_answer: If a specific question was asked, answer it citing file paths. If no question, use null.\n\n"
            "Be concise. Focus on actionable insights."
        ),
        (
            "human",
            "Repository structure:\n{structure}\n\n"
            "Config files found:\n{config_files}\n\n"
            "Entry point candidates:\n{entry_points}\n\n"
            "TODOs found:\n{todos}\n\n"
            "FIXMEs found:\n{fixmes}\n\n"
            "Potential secrets found:\n{secrets}\n\n"
            "Key file contents:\n{key_file_contents}\n\n"
            "Languages detected:\n{language_breakdown}\n\n"
            "Total files: {total_files}\n\n"
            "User question: {question}\n\n"
            "Output ONLY valid JSON matching the schema above."
        ),
    ])


def build_analysis_chain():
    prompt = build_analysis_prompt()
    llm = get_llm()
    return prompt | llm | StrOutputParser()


def generate_analysis(findings: dict, question: str | None) -> CodebaseAnalysis:
    chain = build_analysis_chain()

    inputs = {
        "structure": findings.get("structure", "N/A"),
        "config_files": _format_configs(findings.get("config_files", {})),
        "entry_points": _format_entry_points(findings.get("entry_points", [])),
        "todos": _format_list(findings.get("todos", []), "No TODOs found"),
        "fixmes": _format_list(findings.get("fixmes", []), "No FIXMEs found"),
        "secrets": _format_list(findings.get("secrets", []), "No potential secrets detected"),
        "key_file_contents": _format_contents(findings.get("key_file_contents", {})),
        "language_breakdown": ", ".join(findings.get("language_breakdown", [])),
        "total_files": str(findings.get("total_files", 0)),
        "question": question or "",
    }

    try:
        raw = call_llm_with_retry(chain, inputs)
        logger.info("Raw LLM output length: %d chars", len(raw))
        data = _extract_json(raw)
        result = CodebaseAnalysis(**data)
        result.mermaid_diagram = _clean_mermaid(result.mermaid_diagram)
        logger.info(
            "Parsed analysis: arch=%d chars, entry_points=%d, gotchas=%d, diagram=%d chars",
            len(result.architecture_summary),
            len(result.entry_points),
            len(result.gotchas),
            len(result.mermaid_diagram),
        )
        return result
    except Exception as e:
        logger.error("Analysis generation failed: %s", e)
        raise


def _format_configs(configs: dict) -> str:
    if not configs:
        return "No config files found"
    lines = []
    for name, content in configs.items():
        lines.append(f"--- {name} ---\n{content}")
    return "\n\n".join(lines)


def _format_entry_points(eps: list) -> str:
    if not eps:
        return "No entry points detected"
    return "\n".join(f"- {ep['path']} ({ep['type']})" for ep in eps)


def _format_list(items: list, default: str) -> str:
    if not items:
        return default
    return "\n".join(f"- {item}" for item in items[:20])


def _format_contents(contents: dict) -> str:
    if not contents:
        return "No key files read"
    lines = []
    for path, content in contents.items():
        lines.append(f"--- {path} ---\n{content[:2500]}")
    return "\n\n".join(lines)


def _clean_mermaid(diagram: str) -> str:
    import re

    if not diagram:
        return "graph TD;\n  A[No diagram generated]"

    if "graph TD" not in diagram:
        return "graph TD;\n  A[No diagram generated]"

    idx = diagram.index("graph TD")
    lines = diagram[idx:].split("\n")

    cleaned = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("graph"):
            cleaned.append(line)
            continue
        arrow_present = "-->" in line or "---" in line
        if "-->|" in line and "|>" in line:
            line = line.replace("|>", "|")
        if arrow_present:
            cleaned.append("  " + line)

    result = "\n".join(cleaned) if len(cleaned) > 1 else "graph TD;\n  A[No diagram generated]"
    return result
