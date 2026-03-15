"""Salesman management endpoints for the CAAD ERP API.

This module provides REST endpoints for creating and deactivating salesmen,
mirroring the CLI commands add-salesman and deactivate-salesman.
"""

import fastapi

from caad_erp import bll

from .. import runtime, schemas

router = fastapi.APIRouter(prefix="/salesmen", tags=["Salesmen"])


@router.get("", response_model=schemas.SalesmanListResponse)
def list_salesmen(
    include_inactive: bool = False,
    context: bll.RuntimeContext = fastapi.Depends(
        runtime.get_runtime_context),
) -> schemas.SalesmanListResponse:
    """List salesmen, optionally including inactive ones.

    Args:
        include_inactive: When True, inactive salesmen are included.
            Mirrors the CLI ``--all`` flag. Defaults to False.
        context: Runtime context injected via dependency.

    Returns:
        SalesmanListResponse containing the matching salesman records.
    """
    salesmen = bll.list_salesmen(context, include_inactive=include_inactive)
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
def create_salesman(
    request: schemas.SalesmanCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(
        runtime.get_runtime_context),
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


@router.post("/{salesman_id}/deactivate", response_model=schemas.StandardResponse)
def deactivate_salesman(
    salesman_id: str,
    context: bll.RuntimeContext = fastapi.Depends(
        runtime.get_runtime_context),
) -> schemas.StandardResponse:
    """Deactivate an existing salesman.

    Args:
        salesman_id: The ID of the salesman to deactivate.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the updated salesman data.

    Raises:
        HTTPException: 404 if salesman not found.
    """
    salesman = bll.update_salesman(
        context,
        bll.SalesmanCommand(
            salesman_id=salesman_id,
            salesman_name=None,
            is_active=False,
        ),
    )
    return schemas.StandardResponse(
        detail="Salesman deactivated successfully",
        data=schemas.SalesmanResponse(
            salesman_id=salesman.salesman_id,
            salesman_name=salesman.salesman_name,
            is_active=salesman.is_active,
        ),
    )
