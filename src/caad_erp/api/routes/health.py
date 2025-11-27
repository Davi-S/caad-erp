"""Health check endpoint for the CAAD ERP API.

This module provides a simple health check endpoint to verify that the
API server is running and responding to requests.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    """Response model for the health check endpoint."""

    status: str
    message: str


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Check if the API server is healthy and responding.

    Returns:
        HealthResponse: A status indicating the server is operational.
    """
    return HealthResponse(
        status="healthy",
        message="CAAD ERP API is running",
    )
