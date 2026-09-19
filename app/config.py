import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "homenetwork.db"

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Monitoring intervals (seconds)
BANDWIDTH_POLL_INTERVAL = int(os.getenv("BANDWIDTH_POLL_INTERVAL", 10))
PING_TIMEOUT_MS = int(os.getenv("PING_TIMEOUT_MS", 1500))

# Interface to monitor (empty or 'all' means default active interfaces)
MONITORED_INTERFACE = os.getenv("MONITORED_INTERFACE", "")
