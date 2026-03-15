"""Product management endpoints for the CAAD ERP API.

This module provides REST endpoints for creating and deactivating products,
mirroring the CLI commands add-product and deactivate-product.
"""

import fastapi

from caad_erp import bll

from .. import dependencies, schemas

router = fastapi.APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=schemas.ProductListResponse)
def list_products(
    include_inactive: bool = False,
    context: bll.RuntimeContext = fastapi.Depends(
        dependencies.get_runtime_context),
) -> schemas.ProductListResponse:
    """List products, optionally including inactive ones.

    Args:
        include_inactive: When True, inactive products are included.
            Mirrors the CLI ``--all`` flag. Defaults to False.
        context: Runtime context injected via dependency.

    Returns:
        ProductListResponse containing the matching product records.
    """
    products = bll.list_products(context, include_inactive=include_inactive)
    return schemas.ProductListResponse(
        items=[
            schemas.ProductResponse(
                product_id=p.product_id,
                product_name=p.product_name,
                sell_price=p.sell_price,
                is_active=p.is_active,
            )
            for p in products
        ]
    )


@router.post("", response_model=schemas.StandardResponse, status_code=201)
def create_product(
    request: schemas.ProductCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(
        dependencies.get_runtime_context),
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
    product = bll.add_product(
        context,
        bll.ProductCommand(
            product_id=request.product_id,
            product_name=request.product_name,
            sell_price=request.sell_price,
            is_active=request.is_active,
        ),
    )
    return schemas.StandardResponse(
        detail="Product created successfully",
        data=schemas.ProductResponse(
            product_id=product.product_id,
            product_name=product.product_name,
            sell_price=product.sell_price,
            is_active=product.is_active,
        ),
    )


@router.post("/{product_id}/deactivate", response_model=schemas.StandardResponse)
def deactivate_product(
    product_id: str,
    context: bll.RuntimeContext = fastapi.Depends(
        dependencies.get_runtime_context),
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
    product = bll.update_product(
        context,
        bll.ProductCommand(
            product_id=product_id,
            product_name=None,
            sell_price=None,
            is_active=False,
        ),
    )
    return schemas.StandardResponse(
        detail="Product deactivated successfully",
        data=schemas.ProductResponse(
            product_id=product.product_id,
            product_name=product.product_name,
            sell_price=product.sell_price,
            is_active=product.is_active,
        ),
    )
