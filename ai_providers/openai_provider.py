from openai import OpenAI
import backend.config as config
from .common import build_prompt, error_response, parse_response

MODEL = "gpt-5.4-nano-2026-03-17"


def analyze_openai(endpoint, method, status):
    api_key = config.API_KEYS.get("openai")
    if not api_key:
        return error_response("openai", "No OpenAI API key provided")

    try:
        client = OpenAI(api_key=api_key)
        res = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": build_prompt(endpoint, method, status)}],
            temperature=0.2,
        )
        return parse_response(res.choices[0].message.content, "openai")
    except Exception as e:
        return error_response("openai", f"OpenAI error: {e}")
