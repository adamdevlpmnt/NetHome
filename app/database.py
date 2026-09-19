import sqlite3
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from app.config import DB_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Table des cibles de ping
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ping_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            icon TEXT DEFAULT 'globe',
            is_gateway INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0
        )
    """)
    
    # Table des instantanés de bande passante (historique détaillé)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bandwidth_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            interface TEXT NOT NULL,
            bytes_sent INTEGER NOT NULL,
            bytes_recv INTEGER NOT NULL
        )
    """)
    
    # Table agrégée par jour pour requêtes rapides (date: YYYY-MM-DD)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bandwidth_daily (
            date TEXT PRIMARY KEY,
            bytes_sent INTEGER NOT NULL DEFAULT 0,
            bytes_recv INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Table d'historique des Speedtests Ookla
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS speedtest_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            server_id INTEGER,
            server_name TEXT,
            ping_ms REAL,
            jitter_ms REAL,
            download_mbps REAL,
            upload_mbps REAL,
            download_latency_ms REAL,
            upload_latency_ms REAL,
            packet_loss REAL,
            isp TEXT,
            external_ip TEXT,
            result_url TEXT
        )
    """)

    
    # Cibles par défaut si la table est vide (reprend le style WiFiman)
    cursor.execute("SELECT COUNT(*) FROM ping_targets")
    count = cursor.fetchone()[0]
    if count == 0:
        default_targets = [
            ("Gateway", "auto", "router", 1, 1, 0),
            ("bing.com", "bing.com", "bing", 0, 1, 1),
            ("microsoft.com", "microsoft.com", "microsoft", 0, 1, 2),
            ("xbox.com", "xbox.com", "xbox", 0, 1, 3),
            ("reddit.com", "reddit.com", "reddit", 0, 1, 4),
            ("Cloudflare DNS", "1.1.1.1", "cloudflare", 0, 1, 5),
            ("Google DNS", "8.8.8.8", "google", 0, 1, 6)
        ]
        cursor.executemany("""
            INSERT INTO ping_targets (name, host, icon, is_gateway, is_active, display_order)
            VALUES (?, ?, ?, ?, ?, ?)
        """, default_targets)
        
    conn.commit()
    conn.close()

# --- Fonctions pour les cibles de ping ---

def get_targets(active_only: bool = False) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    if active_only:
        cursor.execute("SELECT * FROM ping_targets WHERE is_active = 1 ORDER BY display_order ASC, id ASC")
    else:
        cursor.execute("SELECT * FROM ping_targets ORDER BY display_order ASC, id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_target(name: str, host: str, icon: str = "globe", is_gateway: bool = False) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(display_order) FROM ping_targets")
    max_order = cursor.fetchone()[0] or 0
    cursor.execute("""
        INSERT INTO ping_targets (name, host, icon, is_gateway, is_active, display_order)
        VALUES (?, ?, ?, ?, 1, ?)
    """, (name, host, icon, 1 if is_gateway else 0, max_order + 1))
    target_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return target_id

def delete_target(target_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ping_targets WHERE id = ?", (target_id,))
    conn.commit()
    conn.close()

def update_target(target_id: int, name: str, host: str, icon: str, is_active: bool):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE ping_targets
        SET name = ?, host = ?, icon = ?, is_active = ?
        WHERE id = ?
    """, (name, host, icon, 1 if is_active else 0, target_id))
    conn.commit()
    conn.close()

# --- Fonctions pour la consommation de bande passante ---

def record_bandwidth_delta(bytes_sent_delta: int, bytes_recv_delta: int, interface: str = "all"):
    if bytes_sent_delta <= 0 and bytes_recv_delta <= 0:
        return

    now_iso = datetime.now().isoformat()
    today_str = date.today().isoformat()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enregistrer le snapshot détaillé
    cursor.execute("""
        INSERT INTO bandwidth_snapshots (timestamp, interface, bytes_sent, bytes_recv)
        VALUES (?, ?, ?, ?)
    """, (now_iso, interface, bytes_sent_delta, bytes_recv_delta))
    
    # Mettre à jour l'agrégat journalier
    cursor.execute("""
        INSERT INTO bandwidth_daily (date, bytes_sent, bytes_recv)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            bytes_sent = bytes_sent + excluded.bytes_sent,
            bytes_recv = bytes_recv + excluded.bytes_recv
    """, (today_str, bytes_sent_delta, bytes_recv_delta))
    
    conn.commit()
    conn.close()

def get_bandwidth_summary() -> Dict[str, Any]:
    """Retourne la consommation du jour, du mois en cours et de l'année en cours."""
    today = date.today()
    today_str = today.isoformat()
    month_prefix = f"{today.year:04d}-{today.month:02d}%"
    year_prefix = f"{today.year:04d}%"
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Aujourd'hui
    cursor.execute("""
        SELECT COALESCE(bytes_sent, 0), COALESCE(bytes_recv, 0)
        FROM bandwidth_daily WHERE date = ?
    """, (today_str,))
    today_row = cursor.fetchone()
    today_sent = today_row[0] if today_row else 0
    today_recv = today_row[1] if today_row else 0
    
    # Ce mois-ci
    cursor.execute("""
        SELECT COALESCE(SUM(bytes_sent), 0), COALESCE(SUM(bytes_recv), 0)
        FROM bandwidth_daily WHERE date LIKE ?
    """, (month_prefix,))
    month_row = cursor.fetchone()
    month_sent = month_row[0] if month_row else 0
    month_recv = month_row[1] if month_row else 0
    
    # Cette année
    cursor.execute("""
        SELECT COALESCE(SUM(bytes_sent), 0), COALESCE(SUM(bytes_recv), 0)
        FROM bandwidth_daily WHERE date LIKE ?
    """, (year_prefix,))
    year_row = cursor.fetchone()
    year_sent = year_row[0] if year_row else 0
    year_recv = year_row[1] if year_row else 0
    
    # Total global
    cursor.execute("""
        SELECT COALESCE(SUM(bytes_sent), 0), COALESCE(SUM(bytes_recv), 0)
        FROM bandwidth_daily
    """)
    total_row = cursor.fetchone()
    total_sent = total_row[0] if total_row else 0
    total_recv = total_row[1] if total_row else 0

    conn.close()
    
    return {
        "today": {"sent": today_sent, "recv": today_recv, "total": today_sent + today_recv},
        "month": {"sent": month_sent, "recv": month_recv, "total": month_sent + month_recv},
        "year": {"sent": year_sent, "recv": year_recv, "total": year_sent + year_recv},
        "all_time": {"sent": total_sent, "recv": total_recv, "total": total_sent + total_recv}
    }

def get_bandwidth_history(start_date: Optional[str] = None, end_date: Optional[str] = None, group_by: str = "day") -> List[Dict[str, Any]]:
    """
    Récupère l'historique filtré par dates.
    group_by: 'day' (YYYY-MM-DD), 'month' (YYYY-MM), 'year' (YYYY)
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT date, bytes_sent, bytes_recv FROM bandwidth_daily WHERE 1=1"
    params = []
    
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
        
    query += " ORDER BY date ASC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    if group_by == "day":
        return [{"period": row["date"], "sent": row["bytes_sent"], "recv": row["bytes_recv"]} for row in rows]
    
    # Agrégation par mois ou par année si demandé
    aggregated = {}
    for row in rows:
        d = row["date"]
        period_key = d[:7] if group_by == "month" else d[:4]
        if period_key not in aggregated:
            aggregated[period_key] = {"period": period_key, "sent": 0, "recv": 0}
        aggregated[period_key]["sent"] += row["bytes_sent"]
        aggregated[period_key]["recv"] += row["bytes_recv"]
        
    return list(aggregated.values())


# --- Fonctions pour l'historique Speedtest ---

def save_speedtest_result(data: Dict[str, Any]) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO speedtest_history (
            timestamp, server_id, server_name, ping_ms, jitter_ms,
            download_mbps, upload_mbps, download_latency_ms, upload_latency_ms,
            packet_loss, isp, external_ip, result_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("timestamp", datetime.now().isoformat()),
        data.get("server_id"),
        data.get("server_name"),
        data.get("ping_ms"),
        data.get("jitter_ms"),
        data.get("download_mbps"),
        data.get("upload_mbps"),
        data.get("download_latency_ms"),
        data.get("upload_latency_ms"),
        data.get("packet_loss", 0),
        data.get("isp"),
        data.get("external_ip"),
        data.get("result_url")
    ))
    res_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return res_id

def get_speedtest_history(limit: int = 15) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM speedtest_history
        ORDER BY id DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_latest_speedtest_result() -> Optional[Dict[str, Any]]:
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM speedtest_history ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception:
        conn.close()
        return None

# Initialisation automatique au chargement
init_db()


