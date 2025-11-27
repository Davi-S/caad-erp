"""Product management endpoints for the CAAD ERP API.

This module provides REST endpoints for creating and deactivating products,
mirroring the CLI commands add-product and deactivate-product.
"""

import fastapi

from caad_erp import bll, exceptions

from .. import dependencies, schemas

router = fastapi.APIRouter(prefix="/products", tags=["Products"])


@router.post("", response_model=schemas.StandardResponse, status_code=201)
def create_product(
    request: schemas.ProductCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(dependencies.get_runtime_context),
) -> schemas.StandardResponse:
    """Create a new product.

    Args:
        request: Product creation payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created product data.

    Raises:
        HTTPException: 409 if product already exists, 400 for validation errors.
    """
    try:
        product = bll.add_product(
            context,
            product_id=request.product_id,
            product_name=request.product_name,
            sell_price=request.sell_price,
            is_active=request.is_active,
        )
        bll.persist_context(context)
        return schemas.StandardResponse(
            detail="Product created successfully",
            data=schemas.ProductResponse(
                product_id=product.product_id,
                product_name=product.product_name,
                sell_price=product.sell_price,
                is_active=product.is_active,
            ),
        )
    except exceptions.BusinessRuleViolation as exc:
        raise fastapi.HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise fastapi.HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{product_id}/deactivate", response_model=schemas.StandardResponse)
def deactivate_product(
    product_id: str,
    context: bll.RuntimeContext = fastapi.Depends(dependencies.get_runtime_context),
) -> schemas.StandardResponse:
    """Deactivate an existing product.

    Args:
        product_id: The ID of the product to deactivate.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the updated product data.

    Raises:
        HTTPException: 404 if product not found.
    """
    try:
        product = bll.update_product(context, product_id, is_active=False)
        bll.persist_context(context)
        return schemas.StandardResponse(
            detail="Product deactivated successfully",
            data=schemas.ProductResponse(
                product_id=product.product_id,
                product_name=product.product_name,
                sell_price=product.sell_price,
                is_active=product.is_active,
            ),
        )
    except exceptions.MissingReferenceError as exc:
        raise fastapi.HTTPException(status_code=404, detail=str(exc)) from exc
