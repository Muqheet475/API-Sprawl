import os
import re
from dotenv import load_dotenv

load_dotenv()

KNOWN_APIS = {
    r"^/$": "Home",
    r"^/users(/.*)?$": "User Service",
    
}

def get_api_label(endpoint: str):
    for pattern, label in KNOWN_APIS.items():
        if re.match(pattern, endpoint):
            return label
    return "Unknown API"

def is_known(endpoint: str) -> bool:
    return get_api_label(endpoint) != "Unknown API"


AI_PROVIDER = "openai"

ALLOWED_AI_PROVIDERS = ["openai", "anthropic", "gemini"]

API_KEYS = {
    "openai": None,
    "anthropic": None,
    "gemini": None
}


# Set SLACK_WEBHOOK_URL in the environment (or .env) to enable Slack alerts.
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
ENABLE_SLACK = bool(SLACK_WEBHOOK_URL)
