import asyncio
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

from app.config import BASE_DIR
from app.database import save_speedtest_result, get_latest_speedtest_result

DEFAULT_SERVER_ID = 68856  # Algérie Télécom - 10G (Algiers)

class SpeedtestRunner:
    def __init__(self):
        self.status: str = "idle"  # idle, running, completed, error
        self.phase: str = "idle"   # idle, ping, download, upload, completed
        self.stage: str = "Prêt"
        self.server_id: int = DEFAULT_SERVER_ID
        self.error_message: Optional[str] = None
        self.current_task: Optional[asyncio.Task] = None
        
        # Métriques en temps réel pour animation de courbe
        self.current_speed_mbps: float = 0.0
        self.progress: float = 0.0
        self.current_ping: Optional[float] = None
        self.current_jitter: Optional[float] = None
        self.download_points: List[float] = []
        self.upload_points: List[float] = []

        self.latest_result: Optional[Dict[str, Any]] = get_latest_speedtest_result()

    def get_binary_path(self) -> Optional[str]:
        """Localise le binaire officiel Ookla speedtest."""
        local_bin_win = BASE_DIR / "bin" / "speedtest.exe"
        local_bin_linux = BASE_DIR / "bin" / "speedtest"
        if sys.platform == "win32" and local_bin_win.exists():
            return str(local_bin_win)
        if local_bin_linux.exists():
            return str(local_bin_linux)

        system_bin = shutil.which("speedtest")
        if system_bin:
            return system_bin

        return None

    def start_test(self, server_id: int = DEFAULT_SERVER_ID) -> Dict[str, Any]:
        """Démarre le test de débit en tâche d'arrière-plan."""
        if self.status == "running":
            return {"status": "already_running", "message": "Un test de débit est déjà en cours d'exécution."}

        self.server_id = server_id or DEFAULT_SERVER_ID
        self.status = "running"
        self.phase = "ping"
        self.stage = "Connexion au serveur..."
        self.current_speed_mbps = 0.0
        self.progress = 0.0
        self.current_ping = None
        self.current_jitter = None
        self.download_points = []
        self.upload_points = []
        self.error_message = None

        self.current_task = asyncio.create_task(self._run_async())
        return {"status": "started", "server_id": self.server_id}

    async def _run_async(self):
        binary = self.get_binary_path()
        if not binary:
            self.status = "error"
            self.phase = "idle"
            self.stage = "Erreur"
            self.error_message = "Binaire officiel Speedtest Ookla introuvable."
            return

        cmd = [
            binary,
            f"--server-id={self.server_id}",
            "--accept-license",
            "--accept-gdpr",
            "--format=jsonl",
            "--progress=yes",
            "--progress-update-interval=150"
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            final_data = None
            stderr_chunks = []

            async def read_stderr():
                while True:
                    err_line = await proc.stderr.readline()
                    if not err_line:
                        break
                    stderr_chunks.append(err_line.decode("utf-8", errors="replace"))

            stderr_task = asyncio.create_task(read_stderr())

            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue

                idx = text.find("{")
                if idx == -1:
                    continue

                try:
                    obj = json.loads(text[idx:])
                    ev_type = obj.get("type")

                    if ev_type == "ping":
                        self.phase = "ping"
                        self.stage = "Mesure de la latence..."
                        p_data = obj.get("ping", {})
                        if "latency" in p_data:
                            self.current_ping = round(p_data["latency"], 1)
                        if "jitter" in p_data:
                            self.current_jitter = round(p_data["jitter"], 1)

                    elif ev_type == "download":
                        self.phase = "download"
                        self.stage = "Mesure du Download (Réception)..."
                        dl_data = obj.get("download", {})
                        bw = dl_data.get("bandwidth", 0)
                        speed = round((bw * 8) / 1_000_000, 2)
                        self.current_speed_mbps = speed
                        self.progress = round(dl_data.get("progress", 0), 2)
                        self.download_points.append(speed)

                    elif ev_type == "upload":
                        self.phase = "upload"
                        self.stage = "Mesure de l'Upload (Envoi)..."
                        ul_data = obj.get("upload", {})
                        bw = ul_data.get("bandwidth", 0)
                        speed = round((bw * 8) / 1_000_000, 2)
                        self.current_speed_mbps = speed
                        self.progress = round(ul_data.get("progress", 0), 2)
                        self.upload_points.append(speed)

                    elif ev_type == "result":
                        final_data = obj

                except json.JSONDecodeError:
                    continue

            await proc.wait()
            await stderr_task

            if proc.returncode != 0 and not final_data:
                self.status = "error"
                self.phase = "idle"
                self.stage = "Échec du test"
                err_text = "".join(stderr_chunks).strip()
                self.error_message = f"Erreur Ookla (Code {proc.returncode}): {err_text[:200]}"
                return

            if final_data:
                dl_bytes = final_data.get("download", {}).get("bandwidth", 0)
                ul_bytes = final_data.get("upload", {}).get("bandwidth", 0)
                download_mbps = round((dl_bytes * 8) / 1_000_000, 2)
                upload_mbps = round((ul_bytes * 8) / 1_000_000, 2)

                p_data = final_data.get("ping", {})
                ping_ms = round(p_data.get("latency", 0), 1)
                jitter_ms = round(p_data.get("jitter", 0), 1)

                dl_lat = final_data.get("download", {}).get("latency", {})
                ul_lat = final_data.get("upload", {}).get("latency", {})
                download_latency_ms = round(dl_lat.get("iqm") or dl_lat.get("low") or 0, 1)
                upload_latency_ms = round(ul_lat.get("iqm") or ul_lat.get("low") or 0, 1)

                srv = final_data.get("server", {})
                server_name = f"{srv.get('name', 'Inconnu')} ({srv.get('location', '')})"

                result_entry = {
                    "timestamp": datetime.now().isoformat(),
                    "server_id": srv.get("id", self.server_id),
                    "server_name": server_name,
                    "ping_ms": ping_ms,
                    "jitter_ms": jitter_ms,
                    "download_mbps": download_mbps,
                    "upload_mbps": upload_mbps,
                    "download_latency_ms": download_latency_ms,
                    "upload_latency_ms": upload_latency_ms,
                    "packet_loss": final_data.get("packetLoss", 0),
                    "isp": final_data.get("isp", ""),
                    "external_ip": final_data.get("interface", {}).get("externalIp", ""),
                    "result_url": final_data.get("result", {}).get("url", "")
                }

                res_id = save_speedtest_result(result_entry)
                result_entry["id"] = res_id

                self.latest_result = result_entry
                self.status = "completed"
                self.phase = "completed"
                self.stage = "Test terminé avec succès"
                self.current_speed_mbps = 0.0
            else:
                self.status = "error"
                self.phase = "idle"
                self.stage = "Aucun résultat final"
                self.error_message = "Le serveur Ookla n'a pas renvoyé de résultat complet."

        except Exception as e:
            self.status = "error"
            self.phase = "idle"
            self.stage = "Erreur"
            self.error_message = str(e)

    def get_status(self) -> Dict[str, Any]:
        """Retourne l'état courant avec les métriques et les points de courbe pour l'animation."""
        return {
            "status": self.status,
            "phase": self.phase,
            "stage": self.stage,
            "server_id": self.server_id,
            "current_speed_mbps": self.current_speed_mbps,
            "progress": self.progress,
            "current_ping": self.current_ping,
            "current_jitter": self.current_jitter,
            "download_points": self.download_points[-50:],
            "upload_points": self.upload_points[-50:],
            "error_message": self.error_message,
            "latest_result": self.latest_result
        }

speedtest_runner = SpeedtestRunner()
