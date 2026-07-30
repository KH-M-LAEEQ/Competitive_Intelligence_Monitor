from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.base import Base


class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, index=True)

    surface_id = Column(
        Integer,
        ForeignKey("surfaces.id"),
        nullable=False
    )

    text_content = Column(Text, nullable=True)
    content_hash = Column(String, nullable=True, index=True)
    screenshot_path = Column(String, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
