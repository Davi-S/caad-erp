import pytest
from fastapi.testclient import TestClient

from caad_erp.api import app as api_app
from caad_erp.api import runtime as api_runtime


@pytest.fixture(autouse=True)
def _disable_real_persistence(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "caad_erp.api.persistence.bll.persist_context",
        lambda _context: None,
    )


@pytest.fixture
def api_client():
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(object())
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client
    api_runtime.clear_runtime_context()


@pytest.fixture
def api_client_without_runtime():
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client
    api_runtime.clear_runtime_context()
