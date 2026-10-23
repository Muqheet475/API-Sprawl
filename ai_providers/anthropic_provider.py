import anthropic
import backend.config as config
from .common import build_prompt, error_response, parse_response

MODEL = "claude-opus-4-7"


def analyze_anthropic(endpoint, method, status):
    api_key = config.API_KEYS.get("anthropic")
    if not api_key:
        return error_response("anthropic", "No Anthropic API key provided")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        res = client.messages.create(
            model=MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": build_prompt(endpoint, method, status)}],
        )
        return parse_response(res.content[0].text, "anthropic")
    except Exception as e:
        return error_response("anthropic", f"Anthropic error: {e}")
