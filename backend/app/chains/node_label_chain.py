import json
import re
import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.llm import get_llm, call_llm_with_retry

logger = logging.getLogger(__name__)

_RESPONSE_FORMAT = json.dumps(
    [{"file_path": "path/to/file.py", "purpose": "Handles user authentication"}],
    indent=2,
)


def build_label_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a codebase analyst. Given a list of file paths with their detected functions and classes, "
            "assign a short one-line purpose to each file (max 80 chars). Be concrete and specific — "
            "describe what the file actually does, not generic labels like 'utility module'.\n\n"
            "Respond with a JSON array in this exact format (substitute real values):\n"
            "{response_format}\n\n"
            "Valid JSON only, no markdown, no code fences."
        ),
        (
            "human",
            "Assign purposes to these files:\n{files_json}\n\n"
            "Output ONLY valid JSON array matching the schema."
        ),
    ])


def _build_label_chain():
    prompt = build_label_prompt()
    llm = get_llm()
    return prompt | llm | StrOutputParser()


def generate_node_labels(nodes: list[dict]) -> list[dict]:
    if not nodes:
        return []

    file_data = []
    for n in nodes:
        entry = {"file_path": n["id"], "functions": n.get("functions", []), "classes": n.get("classes", [])}
        file_data.append(entry)

    chain = _build_label_chain()
    inputs = {
        "files_json": json.dumps(file_data, indent=2),
        "response_format": _RESPONSE_FORMAT,
    }

    try:
        raw = call_llm_with_retry(chain, inputs)
        json_match = re.search(r'\[.*?\]', raw, re.DOTALL)
        if json_match:
            labels = json.loads(json_match.group())
            label_map = {item["file_path"]: item["purpose"] for item in labels if "file_path" in item and "purpose" in item}
            for node in nodes:
                if node["id"] in label_map:
                    node["purpose"] = label_map[node["id"]]
            return nodes
    except Exception as e:
        logger.warning("Node labeling failed: %s — continuing without labels", e)

    return nodes
