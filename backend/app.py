"""
PLACEHOLDER for your own application.

Replace this with your real backend. All it takes to monitor an app is the
one `add_middleware` line below (see sdk/api_sprawl_monitor.py).
"""
import sys
from pathlib import Path

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sdk"))
from api_sprawl_monitor import MonitorASGIMiddleware  # noqa: E402

app = FastAPI()
app.add_middleware(MonitorASGIMiddleware, monitor_url="http://localhost:8000")


@app.get("/")
def home():
    return {"msg": "home"}


@app.get("/users")
def users():
    return {"users": ["A", "B"]}


@app.get("/unknown")
def unknown():
    return {"msg": "shadow test"}
