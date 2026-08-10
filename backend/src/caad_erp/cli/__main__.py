"""Executable entry point for ``python -m caad_erp.cli``."""

from .parser import main

if __name__ == "__main__":
    raise SystemExit(main())
