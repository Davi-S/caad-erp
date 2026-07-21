"""Product management endpoints for the CAAD ERP API.

This module provides REST endpoints for managing products.
"""

import fastapi

from caad_erp import bll

from .. import persistence, runtime, schemas

router = fastapi.APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=schemas.ProductListResponse)
def list_products(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.ProductListResponse:
    """List all products.

    Filtering by active status is a client-side concern.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        ProductListResponse containing every product record.
    """
    products = bll.list_products(context)
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
@persistence.mutating_endpoint
def create_product(
    request: schemas.ProductCreateRequest,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
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


@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(
    product_id: str,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.StandardResponse:
    """Deactivate an existing product.


@router.patch("/{product_id}", response_model=schemas.StandardResponse)
@persistence.mutating_endpoint
def update_product_details(
    product_id: str,
    request: schemas.ProductUpdateRequest,
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.StandardResponse:
    """Update an existing product.

    Can be used to modify the product's name, price, or toggle its active status.
    """
    product = bll.update_product(
        context,
        bll.ProductCommand(
            product_id=product_id,
            product_name=request.product_name,
            sell_price=request.sell_price,
            is_active=request.is_active,
        ),
    )
    return schemas.StandardResponse(
        detail="Product updated successfully",
        data=schemas.ProductResponse(
            product_id=product.product_id,
            product_name=product.product_name,
            sell_price=product.sell_price,
            is_active=product.is_active,
        ),
    )
