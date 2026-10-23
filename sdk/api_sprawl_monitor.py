"""
API Sprawl monitor client: one self-contained file, standard library only.

Copy this file into ANY Python web app and add the middleware. It talks to the
monitor purely over HTTP, so your app can run on a different machine, with a
different framework, and without access to the monitor's database.

    # FastAPI / Starlette / any ASGI app
    from api_sprawl_monitor import MonitorASGIMiddleware
    app.add_middleware(MonitorASGIMiddleware, monitor_url="http://monitor-host:8000")

    # Flask / Django / any WSGI app
    from api_sprawl_monitor import MonitorWSGIMiddleware
    app.wsgi_app = MonitorWSGIMiddleware(app.wsgi_app, monitor_url="http://monitor-host:8000")

If monitor_url is omitted, the MONITOR_URL environment variable is used
(default http://localhost:8000).

For every request the middleware (1) rejects API keys revoked in the monitor
with 403 and (2) reports endpoint/method/status/key to the monitor's /log in
the background. If the monitor is unreachable your app keeps working
(fail-open) and uses the last known revoked-key list.
"""
import asyncio
import json
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REVOKED_BODY = json.dumps({"error": "API key revoked"}).encode()


class MonitorClient:
    def __init__(self, monitor_url=None, revoked_ttl=5.0, timeout=2.0):
        self.base = (monitor_url or os.getenv("MONITOR_URL", "http://localhost:8000")).rstrip("/")
        self.ttl = revoked_ttl          # seconds to cache the revoked-key list
        self.timeout = timeout
        self._revoked = set()
        self._fetched_at = 0.0
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=4)

    # -- revoked keys (cached) -------------------------------------------
    def stale(self):
        return time.monotonic() - self._fetched_at > self.ttl

    def refresh(self):
        try:
            with urllib.request.urlopen(f"{self.base}/revoked-keys", timeout=self.timeout) as r:
                keys = set(json.load(r))
            with self._lock:
                self._revoked = keys
        except Exception:
            pass  # fail-open: keep the previous list
        self._fetched_at = time.monotonic()  # don't hammer a down monitor

    def is_revoked(self, api_key):
        if self.stale():
            self.refresh()
        return api_key in self._revoked

    # -- reporting (fire and forget) -------------------------------------
    def _post_log(self, data):
        try:
            req = urllib.request.Request(
                f"{self.base}/log",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=self.timeout).close()
        except Exception:
            pass

    def report(self, endpoint, method, status, api_key):
        self._pool.submit(self._post_log, {
            "endpoint": endpoint, "method": method, "status": status, "api_key": api_key,
        })


class MonitorASGIMiddleware:
    """Pure ASGI middleware (FastAPI, Starlette, Django ASGI, ...)."""

    def __init__(self, app, monitor_url=None, **client_opts):
        self.app = app
        self.client = MonitorClient(monitor_url, **client_opts)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        api_key = headers.get("authorization", "unknown")

        if self.client.stale():
            await asyncio.to_thread(self.client.refresh)
        if api_key in self.client._revoked:
            await send({"type": "http.response.start", "status": 403,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": REVOKED_BODY})
            return

        status = {"code": 0}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            self.client.report(scope["path"], scope["method"], status["code"], api_key)


class MonitorWSGIMiddleware:
    """WSGI middleware (Flask, Django, Bottle, ...)."""

    def __init__(self, app, monitor_url=None, **client_opts):
        self.app = app
        self.client = MonitorClient(monitor_url, **client_opts)

    def __call__(self, environ, start_response):
        api_key = environ.get("HTTP_AUTHORIZATION", "unknown")

        if self.client.is_revoked(api_key):
            start_response("403 Forbidden", [("Content-Type", "application/json"),
                                             ("Content-Length", str(len(REVOKED_BODY)))])
            return [REVOKED_BODY]

        status = {"code": 0}

        def sr(status_line, headers, exc_info=None):
            status["code"] = int(status_line.split(" ", 1)[0])
            return start_response(status_line, headers, exc_info)

        try:
            return self.app(environ, sr)
        finally:
            self.client.report(environ.get("PATH_INFO", "/"), environ["REQUEST_METHOD"],
                               status["code"], api_key)
