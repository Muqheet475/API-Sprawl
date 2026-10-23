import backend.config as config
from ai_providers.openai_provider import analyze_openai
from ai_providers.anthropic_provider import analyze_anthropic
from ai_providers.gemini_provider import analyze_gemini

PROVIDERS = {
    "openai": analyze_openai,
    "anthropic": analyze_anthropic,
    "gemini": analyze_gemini,
}


def analyze_request(endpoint, method, status):
    """Dispatch to the currently selected AI provider."""
    try:
        analyze = PROVIDERS.get(config.AI_PROVIDER)
        if analyze is None:
            return fallback_response("Provider not supported")
        return analyze(endpoint, method, status)
    except Exception as e:
        print("AI ERROR:", e)
        return fallback_response("AI failure")


def fallback_response(reason):
    return {
        "risk_score": 50,
        "threat_type": "Medium",
        "explanation": reason,
        "model": "fallback",
    }
