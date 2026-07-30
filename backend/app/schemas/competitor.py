from datetime import datetime

from pydantic import BaseModel


class CompetitorCreate(BaseModel):
    name: str


class CompetitorResponse(BaseModel):
    id: int
    name: str
    is_own_site: bool = False
    created_at: datetime | None = None

    class Config:
        from_attributes = True