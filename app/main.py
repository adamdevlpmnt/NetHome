import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from app.config import BASE_DIR
from app.database import (
    init_db, get_targets, add_target, delete_target, update_target,
    get_bandwidth_summary, get_bandwidth_history, get_speedtest_history
)
from app.pinger import ping_all_targets, ping_target, sanitize_host
from app.collector import collector_instance
from app.speedtest_runner import speedtest_runner, DEFAULT_SERVER_ID
import psutil


# Modèles Pydantic pour validation
class TargetCreate(BaseModel):
    name: str
    host: str
    icon: Optional[str] = "globe"
    is_gateway: Optional[bool] = False

class TargetUpdate(BaseModel):
    name: str
    host: str
    icon: str
    is_active: bool

# Lifespan pour démarrage et arrêt propre de la tâche de fond
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrage
    init_db()
    collector_task = asyncio.create_task(collector_instance.start())
    yield
    # Arrêt
    collector_instance.stop()
    collector_task.cancel()
    try:
        await collector_task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="HomeNetwork", version="1.0.0", lifespan=lifespan)

# Fichiers statiques et templates
static_dir = BASE_DIR / "app" / "static"
templates_dir = BASE_DIR / "app" / "templates"
static_dir.mkdir(parents=True, exist_ok=True)
templates_dir.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(templates_dir))

# Route Web principale
@app.get("/")
async def read_root():
    index_file = templates_dir / "index.html"
    return FileResponse(str(index_file))


# Route Manifest PWA
@app.get("/manifest.json")
async def get_manifest():
    manifest_path = static_dir / "manifest.json"
    if manifest_path.exists():
        return FileResponse(str(manifest_path), media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="Manifest not found")

# --- API Latence Réseau (Style WiFiman) ---

@app.get("/api/latency")
async def get_network_latency():
    """Mesure la latence en temps réel vers toutes les cibles actives."""
    targets = get_targets(active_only=True)
    results = await ping_all_targets(targets)
    return {"targets": results}

@app.get("/api/targets")
async def list_targets():
    """Liste toutes les cibles configurées (actives et inactives)."""
    return {"targets": get_targets(active_only=False)}

@app.post("/api/targets")
async def create_target(target: TargetCreate):
    """Ajoute une nouvelle cible de ping avec assainissement de l'hôte."""
    clean_host = sanitize_host(target.host)
    target_id = add_target(
        name=target.name,
        host=clean_host,
        icon=target.icon or "globe",
        is_gateway=target.is_gateway or False
    )
    return {"status": "success", "id": target_id}

@app.put("/api/targets/{target_id}")
async def modify_target(target_id: int, target: TargetUpdate):
    """Modifie une cible de ping existante avec assainissement de l'hôte."""
    clean_host = sanitize_host(target.host)
    update_target(
        target_id=target_id,
        name=target.name,
        host=clean_host,
        icon=target.icon,
        is_active=target.is_active
    )
    return {"status": "success"}


@app.delete("/api/targets/{target_id}")
async def remove_target(target_id: int):
    """Supprime une cible de ping."""
    delete_target(target_id)
    return {"status": "success"}

# --- API Consommation de Bande Passante ---

@app.get("/api/bandwidth/summary")
async def bandwidth_summary():
    """Retourne la consommation du jour, mois, année + vitesses instantanées."""
    summary = get_bandwidth_summary()
    live = collector_instance.get_live_stats()
    return {
        "summary": summary,
        "live": live
    }

@app.get("/api/bandwidth/history")
async def bandwidth_history(
    start_date: Optional[str] = Query(None, description="Date début YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Date fin YYYY-MM-DD"),
    group_by: Optional[str] = Query("day", description="Agrégation: day, month, year")
):
    """Retourne l'historique filtré de consommation réseau."""
    history = get_bandwidth_history(start_date=start_date, end_date=end_date, group_by=group_by)
    return {"history": history, "group_by": group_by}

@app.get("/api/interfaces")
async def list_interfaces():
    """Retourne les interfaces réseau disponibles sur la machine."""
    nics = psutil.net_if_addrs()
    io = psutil.net_io_counters(pernic=True)
    res = []
    for name, addrs in nics.items():
        ip_list = [a.address for a in addrs if a.family.name in ("AF_INET", "AF_INET6")]
        bytes_sent = io[name].bytes_sent if name in io else 0
        bytes_recv = io[name].bytes_recv if name in io else 0
        res.append({
            "name": name,
            "ips": ip_list,
            "bytes_sent": bytes_sent,
            "bytes_recv": bytes_recv
        })
    return {"interfaces": res}

# --- API Speedtest Ookla ---

class SpeedtestRequest(BaseModel):
    server_id: Optional[int] = DEFAULT_SERVER_ID

@app.post("/api/speedtest/run")
async def run_speedtest(req: Optional[SpeedtestRequest] = None):
    """Déclenche un test de débit Ookla avec le serveur spécifié."""
    srv_id = req.server_id if req and req.server_id else DEFAULT_SERVER_ID
    res = speedtest_runner.start_test(server_id=srv_id)
    return res

@app.get("/api/speedtest/status")
async def get_speedtest_status():
    """Retourne l'état courant du test de débit et le dernier résultat."""
    return speedtest_runner.get_status()

@app.get("/api/speedtest/history")
async def get_speedtests(limit: int = 15):
    """Retourne l'historique des tests de débit."""
    history = get_speedtest_history(limit=limit)
    return {"history": history}

