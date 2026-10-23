"""Helpers shared by every AI provider module."""
import json

PROMPT_TEMPLATE = """Analyze API request:

Endpoint: {endpoint}
Method: {method}
Status: {status}

Respond ONLY with valid raw JSON:
{{
  "risk_score": number (0-100),
  "threat_type": string,
  "explanation": string
}}
"""


def build_prompt(endpoint, method, status):
    return PROMPT_TEMPLATE.format(endpoint=endpoint, method=method, status=status)


def error_response(provider, explanation):
    """Neutral medium-risk result used when a provider can't be called."""
    return {
        "risk_score": 50,
        "threat_type": "Medium",
        "explanation": explanation,
        "model": f"{provider}-error",
    }


def parse_response(content, provider):
    """Extract the JSON object from an LLM reply; fall back to raw text."""
    text = (content or "").strip().replace("```json", "").replace("```", "").strip()
    if "{" in text and "}" in text:
        text = text[text.find("{"): text.rfind("}") + 1]
    try:
        data = json.loads(text)
    except Exception:
        data = {"risk_score": 50, "threat_type": "Medium", "explanation": text}
    data["model"] = provider
    return data
