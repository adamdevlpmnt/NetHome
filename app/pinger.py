import asyncio
import os
import platform
import re
import socket
import subprocess
import time
from typing import Dict, Any, List, Optional
from app.config import PING_TIMEOUT_MS

_CACHED_GATEWAY: Optional[str] = None
_CACHED_GATEWAY_TIME: float = 0

def detect_default_gateway() -> str:
    """Détecte dynamiquement l'IP de la passerelle locale (Box/Routeur)."""
    global _CACHED_GATEWAY, _CACHED_GATEWAY_TIME
    now = time.time()
    if _CACHED_GATEWAY and (now - _CACHED_GATEWAY_TIME < 300):
        return _CACHED_GATEWAY

    gateway = None
    system = platform.system().lower()

    if "windows" in system:
        try:
            # Commande PowerShell rapide pour obtenir le NextHop par défaut
            cmd = ["powershell", "-NoProfile", "-Command", 
                   "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            gw = res.stdout.strip()
            if gw and gw != "0.0.0.0" and re.match(r"^\d+\.\d+\.\d+\.\d+$", gw):
                gateway = gw
        except Exception:
            pass

        if not gateway:
            try:
                # Fallback route print
                res = subprocess.run(["route", "print", "0.0.0.0"], capture_output=True, text=True, timeout=3)
                for line in res.stdout.splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 3 and parts[0] == "0.0.0.0" and parts[1] == "0.0.0.0":
                        if re.match(r"^\d+\.\d+\.\d+\.\d+$", parts[2]):
                            gateway = parts[2]
                            break
            except Exception:
                pass

    elif "linux" in system:
        try:
            # Lecture /proc/net/route ou commande ip
            with open("/proc/net/route", "r") as f:
                for line in f.readlines()[1:]:
                    fields = line.strip().split()
                    if fields[1] == "00000000":
                        gw_hex = fields[2]
                        gateway = socket.inet_ntoa(bytes.fromhex(gw_hex)[::-1])
                        break
        except Exception:
            try:
                res = subprocess.run(["ip", "route", "show", "default"], capture_output=True, text=True, timeout=2)
                parts = res.stdout.strip().split()
                if "via" in parts:
                    gateway = parts[parts.index("via") + 1]
            except Exception:
                pass

    if not gateway:
        gateway = "192.168.1.1" # Repli classique box française

    _CACHED_GATEWAY = gateway
    _CACHED_GATEWAY_TIME = now
    return gateway


def sanitize_host(raw_host: str) -> str:
    """Nettoie une adresse pour extraire un nom d'hôte ou une IP valide."""
    if not raw_host:
        return ""
    h = raw_host.strip()
    if h == "auto":
        return h
    # Supprimer les protocoles (http://, https://, etc.)
    h = re.sub(r'^[a-zA-Z]+://', '', h)
    # Supprimer les chemins et paramètres (/path, ?query, etc.)
    h = h.split('/')[0].split('?')[0].split('#')[0]
    # Supprimer le port si ce n'est pas une adresse IPv6 brute
    if ':' in h and not ('[' in h or h.count(':') > 1):
        h = h.split(':')[0]
    return h.strip()


def resolve_host(host: str) -> Dict[str, Any]:
    """Résout le nom d'hôte en identifiant les adresses IPv4 et IPv6 disponibles."""
    clean = sanitize_host(host)
    if clean == "auto":
        clean = detect_default_gateway()

    # Si c'est déjà une IPv4
    try:
        socket.inet_aton(clean)
        return {"resolved_ip": clean, "ip_version": 4, "target_host": clean, "ipv4": clean, "ipv6": None}
    except socket.error:
        pass

    # Si c'est déjà une IPv6
    try:
        socket.inet_pton(socket.AF_INET6, clean)
        return {"resolved_ip": clean, "ip_version": 6, "target_host": clean, "ipv4": None, "ipv6": clean}
    except (socket.error, AttributeError):
        pass

    ipv4_addr = None
    ipv6_addr = None

    try:
        infos = socket.getaddrinfo(clean, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for info in infos:
            family, _, _, _, sockaddr = info
            ip = sockaddr[0]
            if family == socket.AF_INET6 and not ipv6_addr:
                ipv6_addr = ip
            elif family == socket.AF_INET and not ipv4_addr:
                ipv4_addr = ip
    except Exception:
        pass

    # Préférer IPv6 si disponible mais garder IPv4 en réserve
    if ipv6_addr:
        return {
            "resolved_ip": ipv6_addr,
            "ip_version": 6,
            "target_host": ipv6_addr,
            "ipv4": ipv4_addr,
            "ipv6": ipv6_addr
        }
    elif ipv4_addr:
        return {
            "resolved_ip": ipv4_addr,
            "ip_version": 4,
            "target_host": ipv4_addr,
            "ipv4": ipv4_addr,
            "ipv6": None
        }

    return {
        "resolved_ip": clean,
        "ip_version": 4,
        "target_host": clean,
        "ipv4": None,
        "ipv6": None
    }


def ping_sync(host_or_ip: str, timeout_ms: int = PING_TIMEOUT_MS) -> Optional[float]:
    """Exécute un ping système synchrone pour calculer la latence précise en ms."""
    system = platform.system().lower()
    
    # Nettoyage
    target = host_or_ip.strip()
    if "%" in target: # Évite les link-local zone IDs qui font échouer ping directement
        target = target.split("%")[0]

    if "windows" in system:
        cmd = ["ping", "-n", "1", "-w", str(timeout_ms), target]
    else:
        timeout_s = max(1, int(timeout_ms / 1000))
        cmd = ["ping", "-c", "1", "-W", str(timeout_s), target]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=(timeout_ms / 1000) + 1.5)
        out = proc.stdout

        # Gestion des sorties françaises et anglaises (Windows)
        # Ex: "temps=12 ms", "temps<1ms", "time=12ms", "time<1ms"
        match = re.search(r'(?:time|temps)[=<]\s*(\d+(?:\.\d+)?)\s*ms', out, re.IGNORECASE)
        if match:
            val = float(match.group(1))
            return max(1.0, val)
        if "<1ms" in out.lower() or "<1 ms" in out.lower():
            return 1.0

        # Linux format: time=12.4 ms
        match_linux = re.search(r'time=(\d+(?:\.\d+)?)\s*ms', out)
        if match_linux:
            return round(float(match_linux.group(1)), 1)

    except Exception:
        pass

    return None


async def ping_target(target: Dict[str, Any]) -> Dict[str, Any]:
    """Ping asynchrone d'une cible avec fallback intelligent IPv6 -> IPv4."""
    name = target.get("name", "Unknown")
    raw_host = target.get("host", "")
    icon = target.get("icon", "globe")
    is_gateway = bool(target.get("is_gateway", 0))

    if raw_host == "auto" or is_gateway:
        target_host = detect_default_gateway()
        resolved = {"resolved_ip": target_host, "ip_version": 4, "target_host": target_host, "ipv4": target_host, "ipv6": None}
    else:
        resolved = await asyncio.to_thread(resolve_host, raw_host)

    resolved_ip = resolved["resolved_ip"]
    ip_version = resolved["ip_version"]
    dest = resolved["target_host"]

    # Tentative 1 : Ping de l'hôte principal (ex: IPv6 ou IPv4)
    latency = await asyncio.to_thread(ping_sync, dest)

    # Repli automatique : si IPv6 échoue mais qu'une IPv4 existe, on tente l'IPv4
    if latency is None and resolved.get("ipv4") and resolved.get("ipv4") != dest:
        fallback_ip = resolved["ipv4"]
        latency = await asyncio.to_thread(ping_sync, fallback_ip)
        if latency is not None:
            resolved_ip = fallback_ip
            ip_version = 4


    # Classification de l'état et de la couleur
    if latency is None:
        status = "error"
        status_color = "#ef4444" # Rouge
        display_latency = "N/A"
    elif latency <= 30:
        status = "excellent"
        status_color = "#10b981" # Vert émeraude
        display_latency = f"{int(latency)} ms" if latency >= 1 else "<1 ms"
    elif latency <= 70:
        status = "good"
        status_color = "#22c55e" # Vert
        display_latency = f"{int(latency)} ms"
    elif latency <= 130:
        status = "warning"
        status_color = "#f59e0b" # Orange / Jaune
        display_latency = f"{int(latency)} ms"
    else:
        status = "high"
        status_color = "#f97316" # Orange vif
        display_latency = f"{int(latency)} ms"

    return {
        "id": target.get("id"),
        "name": name,
        "host": raw_host,
        "resolved_ip": resolved_ip,
        "ip_version": ip_version,
        "icon": icon,
        "is_gateway": is_gateway,
        "latency_ms": latency,
        "display_latency": display_latency,
        "status": status,
        "status_color": status_color
    }


async def ping_all_targets(targets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ping l'ensemble des cibles en parallèle avec une limite de concurrence."""
    sem = asyncio.Semaphore(10)

    async def _ping_with_sem(t):
        async with sem:
            return await ping_target(t)

    tasks = [_ping_with_sem(t) for t in targets]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return results
