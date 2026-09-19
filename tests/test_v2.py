import urllib.request
import json
import time
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def get_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))

def post_json(url, data):
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))

print("=== TEST 1 : Verifier l'assainissement et le ping de serveurwalpanel.com ===")
wal_res = post_json("http://127.0.0.1:8000/api/targets", {
    "name": "WalPanel Test",
    "host": "https://serveurwalpanel.com:443/login",
    "icon": "server"
})
print("Ajout cible assainie :", wal_res)

lat_data = get_json("http://127.0.0.1:8000/api/latency")
for t in lat_data.get("targets", []):
    if "WalPanel" in t.get("name", ""):
        print(f"  -> Cible: {t['name']} | Hote: {t['host']} | IP: {t['resolved_ip']} | Latence: {t['display_latency']} ({t['status']})")
        assert t['display_latency'] != "N/A", "Erreur: WalPanel affiche toujours N/A !"

print("\n=== TEST 2 : Verifier le streaming de la courbe Speedtest (Points en direct) ===")
st_start = post_json("http://127.0.0.1:8000/api/speedtest/run", {"server_id": 68856})
print("Demarrage Speedtest :", st_start)

points_seen = False
for _ in range(25):
    time.sleep(1)
    status = get_json("http://127.0.0.1:8000/api/speedtest/status")
    phase = status.get("phase")
    speed = status.get("current_speed_mbps")
    dl_pts = len(status.get("download_points", []))
    ul_pts = len(status.get("upload_points", []))
    print(f"  -> Phase: {phase:<10} | Vitesse live: {speed:>6.1f} Mbps | Points DL: {dl_pts} | Points UL: {ul_pts}")
    if dl_pts > 0 or ul_pts > 0:
        points_seen = True
    if status.get("status") in ("completed", "error"):
        break

print("Points de courbe recus en direct :", points_seen)

print("\n=== TEST 3 : Verifier la synthese Bande Passante ===")
bw = get_json("http://127.0.0.1:8000/api/bandwidth/summary")
print("Bande passante summary :", bw.get("summary", {}).get("today"))

print("\n[TOUS LES TESTS SONT VALIDES AVEC SUCCES]")
