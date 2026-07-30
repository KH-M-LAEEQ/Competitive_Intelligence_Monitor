from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey
from datetime import datetime
from app.base import Base


class ChangeLog(Base):
    __tablename__ = "change_logs"

    id = Column(Integer, primary_key=True, index=True)

    competitor_id = Column(
        Integer,
        ForeignKey("competitors.id"),
        nullable=False
    )

    surface_id = Column(
        Integer,
        ForeignKey("surfaces.id"),
        nullable=False
    )

    old_snapshot_id = Column(
        Integer,
        ForeignKey("snapshots.id"),
        nullable=True
    )

    new_snapshot_id = Column(
        Integer,
        ForeignKey("snapshots.id"),
        nullable=False
    )

    diff = Column(Text)

    materiality_score = Column(Integer)

    classification = Column(String)

    rationale = Column(Text)

    visual_diff_score = Column(Float, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )