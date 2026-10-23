from google import genai
import backend.config as config
from .common import build_prompt, error_response, parse_response

MODEL = "gemini-2.5-flash"


def analyze_gemini(endpoint, method, status):
    api_key = config.API_KEYS.get("gemini")
    if not api_key:
        return error_response("gemini", "No Gemini API key provided")

    try:
        # Keep a reference to the client for the whole call: if it is garbage
        # collected mid-request, google-genai closes it ("client has been closed").
        client = genai.Client(api_key=api_key)
        res = client.models.generate_content(
            model=MODEL, contents=build_prompt(endpoint, method, status)
        )
        return parse_response(res.text, "gemini")
    except Exception as e:
        return error_response("gemini", f"Gemini error: {e}")
