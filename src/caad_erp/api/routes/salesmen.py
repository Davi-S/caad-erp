"""Salesman management endpoints for the CAAD ERP API.

This module provides REST endpoints for creating and deactivating salesmen,
mirroring the CLI commands add-salesman and deactivate-salesman.
"""

import fastapi

from caad_erp import bll, exceptions

from .. import dependencies, schemas

router = fastapi.APIRouter(prefix="/salesmen", tags=["Salesmen"])


@router.post("", response_model=schemas.StandardResponse, status_code=201)
def create_salesman(
    request: schemas.SalesmanCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(dependencies.get_runtime_context),
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
    try:
        salesman = bll.add_salesman(
            context,
            salesman_id=request.salesman_id,
            salesman_name=request.salesman_name,
            is_active=request.is_active,
        )
        bll.persist_context(context)
        return schemas.StandardResponse(
            detail="Salesman created successfully",
            data=schemas.SalesmanResponse(
                salesman_id=salesman.salesman_id,
                salesman_name=salesman.salesman_name,
                is_active=salesman.is_active,
            ),
        )
    except exceptions.BusinessRuleViolation as exc:
        raise fastapi.HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise fastapi.HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{salesman_id}/deactivate", response_model=schemas.StandardResponse)
def deactivate_salesman(
    salesman_id: str,
    context: bll.RuntimeContext = fastapi.Depends(dependencies.get_runtime_context),
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
    try:
        salesman = bll.update_salesman(context, salesman_id, is_active=False)
        bll.persist_context(context)
        return schemas.StandardResponse(
            detail="Salesman deactivated successfully",
            data=schemas.SalesmanResponse(
                salesman_id=salesman.salesman_id,
                salesman_name=salesman.salesman_name,
                is_active=salesman.is_active,
            ),
        )
    except exceptions.MissingReferenceError as exc:
        raise fastapi.HTTPException(status_code=404, detail=str(exc)) from exc
