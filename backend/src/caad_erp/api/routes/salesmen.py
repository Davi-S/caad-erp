"""Salesman management endpoints for the CAAD ERP API.

This module provides REST endpoints for managing salesmen,
"""

import fastapi

from caad_erp import bll

from .. import persistence, runtime, schemas

router = fastapi.APIRouter(prefix="/salesmen", tags=["Salesmen"])


@router.get("", response_model=schemas.SalesmanListResponse)
def list_salesmen(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.SalesmanListResponse:
    """List all salesmen.

    Filtering by active status is a client-side concern.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        SalesmanListResponse containing every salesman record.
    """
    salesmen = bll.list_salesmen(context)
    return schemas.SalesmanListResponse(
        items=[
            schemas.SalesmanResponse(
                salesman_id=s.salesman_id,
                salesman_name=s.salesman_name,
                is_active=s.is_active,
            )
            for s in salesmen
        ]
    )


@router.post("", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def create_salesman(
    request: schemas.SalesmanCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.StandardResponse:
    """Create a new salesman.

    Args:
        request: Salesman creation payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created salesman data.

    Raises:
        HTTPException: 409 if salesman already exists, 400 for validation errors.
    """
    salesman = bll.add_salesman(
        context,
        bll.SalesmanCommand(
            salesman_id=request.salesman_id,
            salesman_name=request.salesman_name,
            is_active=request.is_active,
        ),
    )
    return schemas.StandardResponse(
        detail="Salesman created successfully",
        data=schemas.SalesmanResponse(
            salesman_id=salesman.salesman_id,
            salesman_name=salesman.salesman_name,
            is_active=salesman.is_active,
        ),
    )


@router.get("/{salesman_id}", response_model=schemas.SalesmanResponse)
def get_salesman(
    salesman_id: str,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.SalesmanResponse:
    """Get a specific salesman by ID."""
    salesmen = bll.list_salesmen(context)
    salesman = next(filter(lambda row: row.salesman_id == salesman_id, salesmen))
    return schemas.SalesmanResponse(
        salesman_id=salesman.salesman_id,
        salesman_name=salesman.salesman_name,
        is_active=salesman.is_active,
    )


@router.patch("/{salesman_id}", response_model=schemas.StandardResponse)
@persistence.mutating_endpoint
def update_salesman_details(
    salesman_id: str,
    request: schemas.SalesmanUpdateRequest,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.StandardResponse:
    """Update an existing salesman.

    Can be used to modify the salesman's name or toggle their active status.
    """
    salesman = bll.update_salesman(
        context,
        bll.SalesmanCommand(
            salesman_id=salesman_id,
            salesman_name=request.salesman_name,
            is_active=request.is_active,
        ),
    )
    return schemas.StandardResponse(
        detail="Salesman updated successfully",
        data=schemas.SalesmanResponse(
            salesman_id=salesman.salesman_id,
            salesman_name=salesman.salesman_name,
            is_active=salesman.is_active,
        ),
    )
