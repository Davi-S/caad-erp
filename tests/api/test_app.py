"""Tests for the CAAD ERP API application factory."""

import pytest

from caad_erp.api import create_app
from caad_erp.api.app import APP_TITLE, APP_DESCRIPTION, APP_VERSION


def test_create_app_returns_fastapi_instance():
    """
    Given the app factory function
    When create_app is called
    Then it returns a FastAPI application instance.
    """

    # Arrange
    # (no setup needed)

    # Act
    app = create_app()

    # Assert
    from fastapi import FastAPI
    assert isinstance(app, FastAPI)


def test_create_app_sets_metadata():
    """
    Given the app factory function
    When create_app is called
    Then the app has the expected title, description, and version.
    """

    # Arrange
    # (no setup needed)

    # Act
    app = create_app()

    # Assert
    assert app.title == APP_TITLE
    assert app.description == APP_DESCRIPTION
    assert app.version == APP_VERSION


def test_create_app_includes_health_route():
    """
    Given the app factory function
    When create_app is called
    Then the app has the /health route registered.
    """

    # Arrange
    # (no setup needed)

    # Act
    app = create_app()

    # Assert
    routes = [route.path for route in app.routes]
    assert "/health" in routes


def test_create_app_configures_cors():
    """
    Given the app factory function
    When create_app is called
    Then the app has CORS middleware configured.
    """

    # Arrange
    # (no setup needed)

    # Act
    app = create_app()

    # Assert
    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" in middleware_classes
