import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum
from app.base import Base


class SurfaceType(str, enum.Enum):
    pricing = "pricing"
    product = "product"
    changelog = "changelog"
    blog = "blog"
    jobs = "jobs"
    other = "other"


class Surface(Base):
    __tablename__ = "surfaces"

    id = Column(Integer, primary_key=True, index=True)

    competitor_id = Column(
        Integer,
        ForeignKey("competitors.id"),
        nullable=False
    )

    surface_type = Column(
        Enum(SurfaceType),
        nullable=False,
        default=SurfaceType.other
    )

    url = Column(
        String,
        nullable=False
    )

    check_frequency = Column(
        String,
        default="daily"
    )

    capture_visual = Column(
        Boolean,
        nullable=False,
        default=False
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True
    )

    last_checked_at = Column(DateTime, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
