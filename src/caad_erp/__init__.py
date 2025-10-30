import logging
import sys
import os

# Get the project root directory
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_FILE = os.path.join(PROJECT_ROOT, 'caad_erp.log')

# Get the root logger for this package
log = logging.getLogger(__name__)
# Set the minimum level to log
log.setLevel(logging.INFO) 

# Create a formatter
formatter = logging.Formatter(
    fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# File Handler
# This handler writes logs to the log file
try:
    file_handler = logging.FileHandler(LOG_FILE, mode='a')
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)
    log.addHandler(file_handler)
except PermissionError:
    # This can happen in restricted environments
    print(f"Warning: No permission to write to log file at {LOG_FILE}", file=sys.stderr)

# Console Handler
# This handler prints logs (INFO and higher) to the console (stderr)
console_handler = logging.StreamHandler(sys.stderr)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)
log.addHandler(console_handler)

log.info("Logger initialized for the 'caad_erp' package.")
