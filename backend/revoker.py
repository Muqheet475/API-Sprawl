from .database import SessionLocal
from .models import RevokedKey

def revoke_key(api_key: str, reason: str):
    db = SessionLocal()

    exists = db.query(RevokedKey).filter_by(api_key=api_key).first()
    if exists:
        db.close()
        return

    db.add(RevokedKey(api_key=api_key, reason=reason))
    db.commit()
    db.close()