from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.competitor import Competitor
from app.models.user import User
from app.models.workspace_member import WorkspaceMember, WorkspaceRole
from app.schemas.competitor import (
    CompetitorCreate,
    CompetitorResponse
)
from app.dependencies import get_current_user, get_current_workspace, require_role

router = APIRouter(
    prefix="/workspaces/{workspace_id}/competitors",
    tags=["Competitors"]
)


@router.post(
    "/",
    response_model=CompetitorResponse
)
def create_competitor(
    workspace_id: int,
    competitor: CompetitorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    membership: WorkspaceMember = Depends(require_role(WorkspaceRole.owner, WorkspaceRole.editor))
):

    existing = (
        db.query(Competitor)
        .filter(
            Competitor.workspace_id == workspace_id,
            Competitor.name == competitor.name
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Competitor already tracked"
        )

    new_competitor = Competitor(
        name=competitor.name,
        workspace_id=workspace_id,
        created_by_user_id=current_user.id
    )

    db.add(new_competitor)
    db.commit()
    db.refresh(new_competitor)

    return new_competitor


@router.get(
    "/",
    response_model=list[CompetitorResponse]
)
def get_competitors(
    workspace_id: int,
    db: Session = Depends(get_db),
    membership: WorkspaceMember = Depends(get_current_workspace)
):

    competitors = (
        db.query(Competitor)
        .filter(
            Competitor.workspace_id == workspace_id
        )
        .all()
    )

    return competitors


@router.delete("/{competitor_id}")
def delete_competitor(
    workspace_id: int,
    competitor_id: int,
    db: Session = Depends(get_db),
    membership: WorkspaceMember = Depends(require_role(WorkspaceRole.owner, WorkspaceRole.editor))
):

    competitor = (
        db.query(Competitor)
        .filter(
            Competitor.id == competitor_id,
            Competitor.workspace_id == workspace_id
        )
        .first()
    )

    if not competitor:
        raise HTTPException(
            status_code=404,
            detail="Competitor not found"
        )

    db.delete(competitor)
    db.commit()

    return {
        "message": "Competitor deleted"
    }
