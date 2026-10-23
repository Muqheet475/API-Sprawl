from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import asyncio
from .websocket import connect, disconnect, broadcast
from .detector import detect_shadow
from .ai_router import analyze_request
from .database import SessionLocal, engine, Base
from . import models, config
from pydantic import BaseModel
from .revoker import revoke_key
from .models import RevokedKey
from .notifier import send_external_notifications


app = FastAPI()
Base.metadata.create_all(bind=engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await connect(ws)
    try:
        while True:
            await ws.receive_text()
    except:
 
        await disconnect(ws)

@app.post("/log")
async def receive_log(data: dict):
    db = SessionLocal()
    try:
        endpoint = data.get("endpoint", "")
        method = data.get("method", "")
        status = data.get("status", 0)
        api_key = data.get("api_key", "unknown")

        # Check for revoked keys
        revoked = db.query(RevokedKey).filter_by(api_key=api_key).first()
        if revoked:
            return {"error": "API key revoked"}
        
        # 1. Get or create endpoint
        endpoint_obj = db.query(models.APIEndpoint).filter_by(
            path=endpoint, method=method
        ).first()

        if not endpoint_obj:
            endpoint_obj = models.APIEndpoint(
                path=endpoint,
                method=method,
                description="Auto discovered",
                status="active"
            )
            db.add(endpoint_obj)
            db.flush() 

        # 2. Insert API log
        log = models.APILog(
            endpoint_id=endpoint_obj.id,
            status_code=status,
            api_key=api_key
        )
        db.add(log)
        db.flush()

        # 3. Hybrid Detection (Rule + AI)
        shadow_result = detect_shadow(endpoint)
        is_shadow = shadow_result["shadow"]

        analysis_result = await asyncio.to_thread(
            analyze_request, endpoint, method, status
        )
        risk_score = analysis_result["risk_score"]
        threat_type = analysis_result["threat_type"]
        explanation = analysis_result["explanation"]

        if is_shadow:
            risk_score = max(risk_score, 80)
            threat_type = "Shadow API"
            explanation = f"[SHADOW API] {shadow_result['label']} | " + explanation

        # 4. Create Enriched Data 
        enriched_data = {
            "endpoint": endpoint,
            "method": method,
            "status": status,
            "risk_score": risk_score,
            "threat_type": threat_type,
            "explanation": explanation,
            "shadow": is_shadow,  
            "model": analysis_result.get("model", "unknown"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "api_key": api_key
        }

        # 5. Insert analysis       
        analysis = models.SecurityAnalysis(
            log_id=log.id,
            risk_score=risk_score,
            threat_type=threat_type,
            description=explanation,
            flag=is_shadow or risk_score > 70,
            model=analysis_result.get("model", "unknown")
        )
        db.add(analysis)
        db.flush()

        # 6. Insert alert if needed
        if is_shadow or risk_score > 70:
            alert = models.Alert(
                analysis_id=analysis.id,
                severity="HIGH",
                message = "Shadow API detected" if is_shadow else "High risk API detected",
                status="unresolved"
            )
            db.add(alert)

        db.commit()

        # 7. Trigger External Notification Service
        if is_shadow or risk_score > 70:
            asyncio.create_task(send_external_notifications(enriched_data))

        # 8. Send enriched data to frontend
        await broadcast(enriched_data)

        return {"message": "Log stored and processed"}

    except Exception as e:
        db.rollback()
        return {"error": str(e)}

    finally:
        db.close()

@app.get("/logs")
def get_logs():
    db = SessionLocal()

    try:
        logs = db.query(models.APILog).all()
        result = []

        for log in logs:
            endpoint = db.query(models.APIEndpoint).filter_by(id=log.endpoint_id).first()
            analysis = db.query(models.SecurityAnalysis).filter_by(log_id=log.id).first()

            result.append({
                "endpoint": endpoint.path if endpoint else "Unknown",
                "method": endpoint.method if endpoint else "GET",
                "status": log.status_code,
                "risk_score": analysis.risk_score if analysis else 0,
                "threat_type": analysis.threat_type if analysis else "Unknown",
                "explanation": analysis.description if analysis else "",
                "timestamp": log.timestamp.isoformat(),
                "model": analysis.model if analysis else "unknown",
                "api_key": log.api_key
            })
        return result

    finally:
        db.close()

@app.post("/set-ai")
def set_ai_provider(data: dict):
    provider = data.get("provider")

    if provider not in config.ALLOWED_AI_PROVIDERS:
        return {"error": "Invalid AI provider"}

    config.AI_PROVIDER = provider  
    return {
        "message": f"AI provider set to {provider}"
    }


@app.post("/set-api-keys")
def set_api_keys(data: dict):
    provider = data.get("provider")
    key = data.get("key")

    if not provider or not key:
        return {"error": "Missing provider or key"}

    config.API_KEYS[provider] = key

    return {"message": f"{provider} API key set"}

@app.get("/revoked-keys")
def list_revoked_keys():
    """Revoked API keys; polled by the monitor client in each protected app."""
    db = SessionLocal()
    try:
        return [k.api_key for k in db.query(RevokedKey).all()]
    finally:
        db.close()


class RevokeRequest(BaseModel):
    api_key: str
    reason: str

@app.post("/revoke-key")
def manual_revoke(req: RevokeRequest):
    revoke_key(req.api_key, req.reason)
    return {"status": "revoked"}