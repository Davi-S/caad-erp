"""FastAPI-based headless API layer for the CAAD ERP system.

This package provides HTTP endpoints that translate REST requests into BLL
calls, enabling web-based user interfaces and local network access to the
system.

Note: This API server is intended for local network operation only. The primary
use cases are:
- Local-Only Development: API and UI running on the same computer.
- Local Network (Shared): API on one host, accessed by others on the same WiFi.
"""

from .app import *
from .server import *
