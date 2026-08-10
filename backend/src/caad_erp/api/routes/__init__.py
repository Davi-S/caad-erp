"""API route modules for the CAAD ERP system."""

import fastapi

from .health import router as health_router
from .mercado_pago_proxy import router as mp_proxy_router
from .products import router as products_router
from .reports import router as reports_router
from .salesmen import router as salesmen_router
from .transactions import router as transactions_router

# Main router aggregating all domain routes
router = fastapi.APIRouter()
router.include_router(health_router)
router.include_router(products_router)
router.include_router(salesmen_router)
router.include_router(transactions_router)
router.include_router(reports_router)
router.include_router(mp_proxy_router)
