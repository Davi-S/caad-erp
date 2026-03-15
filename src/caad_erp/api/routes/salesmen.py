"""Salesman management endpoints for the CAAD ERP API.

This module provides REST endpoints for creating and deactivating salesmen,
mirroring the CLI commands add-salesman and deactivate-salesman.
"""

import fastapi

from caad_erp import bll

from .. import dependencies, schemas

router = fastapi.APIRouter(prefix="/salesmen", tags=["Salesmen"])


@router.post("", response_model=schemas.StandardResponse, status_code=201)
def create_salesman(
    request: schemas.SalesmanCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(
        dependencies.get_runtime_context),
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
        dependencies.get_runtime_context),
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
