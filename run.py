import sys
import uvicorn
from app.config import HOST, PORT

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    print("======================================================")
    print("Demarrage de HomeNetwork...")
    print(f"Acces local      : http://localhost:{PORT}")
    print(f"Acces smartphone : http://<IP_DE_VOTRE_SERVEUR>:{PORT}")
    print("======================================================")
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)

