from sqlalchemy import Column, Integer, String, Text, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from .database import Base

class APIEndpoint(Base):
    __tablename__ = "api_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String)
    method = Column(String)
    description = Column(Text)
    status = Column(String)
    created_at = Column(DateTime, default=func.now())


class APILog(Base):
    __tablename__ = "api_logs"

    id = Column(Integer, primary_key=True, index=True)
    endpoint_id = Column(Integer, ForeignKey("api_endpoints.id"))
    request_data = Column(Text)
    response_data = Column(Text)
    api_key = Column(String)
    status_code = Column(Integer)
    response_time = Column(Float)
    ip_address = Column(String)
    timestamp = Column(DateTime, default=func.now())


class SecurityAnalysis(Base):
    __tablename__ = "security_analysis"

    id = Column(Integer, primary_key=True, index=True)
    log_id = Column(Integer, ForeignKey("api_logs.id"))
    model = Column(String)
    risk_score = Column(Float)
    threat_type = Column(String)
    description = Column(Text)
    flag = Column(Boolean)
    timestamp = Column(DateTime, default=func.now())


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("security_analysis.id"))
    severity = Column(String)
    message = Column(Text)
    status = Column(String)
    timestamp = Column(DateTime, default=func.now())

class RevokedKey(Base):
    __tablename__ = "revoked_keys"

    id = Column(Integer, primary_key=True, index=True)
    api_key = Column(String, index=True)
    reason = Column(String)
    timestamp = Column(DateTime, default=func.now())

