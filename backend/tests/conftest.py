import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.base import Base
from app.database import get_db
from app.main import app

# Import all models so Base.metadata knows about every table before create_all.
from app.models.user import User  # noqa: F401
from app.models.competitor import Competitor  # noqa: F401
from app.models.change_log import ChangeLog  # noqa: F401
from app.models.workspace import Workspace  # noqa: F401
from app.models.workspace_member import WorkspaceMember  # noqa: F401
from app.models.surface import Surface  # noqa: F401
from app.models.snapshot import Snapshot  # noqa: F401
from app.models.llm_usage import TokenUsageLog  # noqa: F401
from app.models.check_run import CheckRun  # noqa: F401
from app.models.change_embedding import ChangeEmbedding  # noqa: F401
from app.models.workspace_budget import WorkspaceBudget  # noqa: F401
from app.models.briefing import Briefing  # noqa: F401
from app.models.approval_item import ApprovalItem  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.battlecard import Battlecard  # noqa: F401
from app.models.battlecard_update import BattlecardUpdate  # noqa: F401
from app.models.response_library import ResponseLibraryItem  # noqa: F401
from app.models.workspace_integration import WorkspaceIntegration  # noqa: F401
from app.models.company_profile import CompanyProfile  # noqa: F401


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autoflush=False, autocommit=False, bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session, monkeypatch):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    # The scheduler's start/stop hit the real production DB via SessionLocal
    # directly (not the get_db override above), since app lifespan events
    # aren't part of FastAPI's dependency-injection system. Neutralize them
    # here so tests never touch the real DB or spin up real APScheduler jobs.
    monkeypatch.setattr("app.main.start_scheduler", lambda: None)
    monkeypatch.setattr("app.main.stop_scheduler", lambda: None)

    # Tests must never depend on whether a real NVIDIA_API_KEY happens to be
    # configured in the developer's .env — default every test to "no LLM
    # configured" so the suite stays fast, deterministic, and free. Tests
    # that specifically exercise LLM behavior monkeypatch this again
    # themselves with a fake client, which overrides this default.
    monkeypatch.setattr("app.services.check_service.get_llm_client", lambda: None)

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
