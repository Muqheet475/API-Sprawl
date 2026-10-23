# API Sprawl — AI-Assisted API Security Dashboard

Detects **shadow APIs** (endpoints nobody registered) and risky API traffic in real time. Every request seen by the monitor is logged, checked against a list of known endpoints, scored for risk by an LLM (OpenAI, Anthropic or Gemini), and pushed live to a web dashboard. High-risk calls raise alerts (Slack + console email stub), and compromised API keys can be revoked from the UI.

## How it works

```
 Your app  ──(middleware)──►  POST /log  ──►  Monitor backend (FastAPI :8000)
 (backend/app.py is a placeholder)              ├─ rule check: known vs. shadow endpoint
                                                ├─ AI risk analysis (selected provider)
                                                ├─ SQLite storage + alerts
                                                └─ WebSocket /ws ──► Dashboard (frontend)
```

## Project structure

| Path | Description |
|---|---|
| `backend/main.py` | The monitor service (FastAPI). Endpoints: `POST /log` (ingest + analyse + alert + broadcast), `GET /logs` (history), `POST /set-ai` (choose provider), `POST /set-api-keys` (set provider key, in memory only), `POST /revoke-key`, `GET /revoked-keys` (polled by the SDK), and `WS /ws` (live feed). |
| `backend/app.py` | **Placeholder for your own application.** A minimal FastAPI app (`/`, `/users`, `/unknown`) showing how a monitored app is wired up. Replace it with your real backend; `/unknown` is deliberately unregistered so you can see a shadow API get flagged. |
| `sdk/api_sprawl_monitor.py` | **The integration point.** A single, dependency-free file you copy into your app. Provides `MonitorASGIMiddleware` (FastAPI, Starlette, Django ASGI) and `MonitorWSGIMiddleware` (Flask, Django, Bottle). It rejects revoked keys with 403 and reports each request to the monitor over HTTP, so your app can live on a different server. |
| `backend/detector.py` | Rule-based shadow-API detection by matching paths against `KNOWN_APIS`. |
| `backend/config.py` | Known-API registry (`KNOWN_APIS` regexes), active AI provider, in-memory provider keys, Slack setting. |
| `backend/ai_router.py` | Sends analysis to the selected provider; falls back to a neutral 50-risk result on failure. |
| `backend/models.py`, `database.py` | SQLAlchemy models (endpoints, logs, security analysis, alerts, revoked keys) on SQLite `api_monitor.db`, created automatically on first run. |
| `backend/notifier.py` | Alerts for high-risk calls: Slack webhook, plus a console-printed email stub. |
| `backend/revoker.py` | Stores revoked API keys. |
| `backend/websocket.py` | WebSocket connection manager and broadcast. |
| `ai_providers/` | One module per LLM (`openai_provider.py`, `anthropic_provider.py`, `gemini_provider.py`) plus `common.py` (shared prompt, JSON parsing, error result). |
| `frontend/` | Static dashboard (`index.html`, `style.css`, `script.js`): live traffic table, risk charts, service health, AI provider/key settings, key revocation. |

A request is flagged and an alert is created when it hits a shadow endpoint **or** the AI risk score is above 70 (shadow APIs score at least 80).

## Deployment

**Requirements:** Python 3.10+ and an API key for at least one provider (OpenAI, Anthropic or Google Gemini).

### 1. Install

```bash
git clone <your-repo-url> && cd api-sprawl
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure (optional)

```bash
cp .env.example .env
# set SLACK_WEBHOOK_URL in .env to enable Slack alerts
```

Register your real endpoints in `backend/config.py` → `KNOWN_APIS`; anything not matching is treated as a shadow API.

### 3. Connect your application

`backend/app.py` is only a placeholder. Your app does **not** need to live in this repo, share its database or use a particular framework: copy `sdk/api_sprawl_monitor.py` next to your code and add one line.

```python
# FastAPI / Starlette / any ASGI app
from api_sprawl_monitor import MonitorASGIMiddleware
app.add_middleware(MonitorASGIMiddleware, monitor_url="http://<monitor-host>:8000")
```

```python
# Flask / Django / any WSGI app
from api_sprawl_monitor import MonitorWSGIMiddleware
app.wsgi_app = MonitorWSGIMiddleware(app.wsgi_app, monitor_url="http://<monitor-host>:8000")
```

`monitor_url` can also be set with the `MONITOR_URL` environment variable (default `http://localhost:8000`). The SDK reports every request in the background, caches the revoked-key list for 5 seconds, and fails open: if the monitor is unreachable, your app keeps serving traffic. Keys are read from the `Authorization` header.

Register your app's real routes in `backend/config.py` → `KNOWN_APIS` (on the monitor); any path that doesn't match is flagged as a shadow API.

### 4. Run (from the project root)

```bash
# Monitor backend (terminal 1)
uvicorn backend.main:app --port 8000

# Your app with the middleware (terminal 2), or the placeholder app:
uvicorn backend.app:app --reload --port 9000

# Dashboard (terminal 3)
python -m http.server 5501 --directory frontend
```

Open <http://localhost:5501>, go to settings, pick an AI provider and enter its API key (held in backend memory only; re-enter it after a restart). Then send traffic to your app (shown here with the placeholder):

```bash
curl localhost:9000/users                                # known endpoint
curl localhost:9000/unknown                              # shadow API -> alert
curl -H "Authorization: demo-key" localhost:9000/users   # tracked by API key
```

The dashboard's health panel pings `http://127.0.0.1:9000/`; change that URL in `frontend/script.js` if your app runs elsewhere.

### Deploying beyond localhost

- The dashboard hardcodes `http://localhost:8000` / `ws://localhost:8000` in `frontend/script.js`. Update it to your monitor's address, and set `MONITOR_URL` in your protected app(s) (and use `wss://`/HTTPS behind a reverse proxy).
- CORS is currently open (`allow_origins=["*"]`) and the control endpoints (`/set-api-keys`, `/set-ai`, `/revoke-key`) have no authentication. Restrict origins and add authentication before exposing this publicly.
- Run uvicorn without `--reload` in production, e.g. under systemd or Docker, and back up `api_monitor.db` (it is git-ignored).

## Notes

- Models used: `gpt-5.4-nano-2026-03-17` (OpenAI), `claude-opus-4-7` (Anthropic), `gemini-2.5-flash` (Gemini). Change the `MODEL` constant at the top of each provider file.
- Never commit `.env` or `*.db`; both are in `.gitignore`.
