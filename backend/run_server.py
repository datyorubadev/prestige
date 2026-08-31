import sys
import os

os.environ.setdefault("PYDANTIC_DISABLE_PLUGINS", "__all__")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from app.main import app

if __name__ == "__main__":
    print("Starting Prestige backend server on 0.0.0.0:8000...", flush=True)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info")
