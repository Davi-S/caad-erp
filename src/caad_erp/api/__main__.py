"""Allow running the API server as a module: python -m caad_erp.api"""

from .server import main

if __name__ == "__main__":
    main()
