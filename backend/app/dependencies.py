from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.workspace_member import WorkspaceMember, WorkspaceRole
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    email = payload.get("sub")

    if email is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user


def get_current_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> WorkspaceMember:
    """Resolves the caller's membership in `workspace_id`, 404ing if they
    aren't a member — this is what keeps one workspace's data invisible to
    another, so every workspace-scoped router depends on it rather than
    querying WorkspaceMember directly.
    """

    membership = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=404,
            detail="Workspace not found"
        )

    return membership


def require_role(*roles: WorkspaceRole):
    def _check(
        membership: WorkspaceMember = Depends(get_current_workspace)
    ) -> WorkspaceMember:
        if membership.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action"
            )

        return membership

    return _check