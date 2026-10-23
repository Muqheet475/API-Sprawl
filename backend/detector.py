import re
from .config import KNOWN_APIS

def detect_shadow(endpoint: str):
    for pattern, label in KNOWN_APIS.items():
        if re.match(pattern, endpoint):
            return {
                "shadow": False,
                "label": label
            }

    return {
        "shadow": True,
        "label": "Unknown / Shadow API"
    }