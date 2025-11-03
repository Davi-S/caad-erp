"""Data access layer helpers for the Excel-backed CAAD ERP datastore.

The package aggregates the concrete persistence helpers implemented across the
individual modules so callers can rely on a single import point. Each module
provides typed adapters for working with a specific portion of the workbook or
configuration stack, and those names are re-exported here for convenience.
"""

from .config import *
from .products import *
from .salesmen import *
from .transactions import *
from .workbook import *
