from datetime import datetime

from pydantic import BaseModel


class CompetitorCreate(BaseModel):
    name: str


class CompetitorResponse(BaseModel):
    id: int
    name: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True