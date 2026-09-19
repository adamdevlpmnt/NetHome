import sys
import urllib.request
import json
import time

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def get_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))

def post_json(url, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))

print("1. Vérification de l'état initial...")
init_status = get_json("http://127.0.0.1:8000/api/speedtest/status")
print("Status initial:", init_status.get("status"))

print("\n2. Démarrage du Speedtest avec le serveur 68856 (Algérie Télécom)...")
run_res = post_json("http://127.0.0.1:8000/api/speedtest/run", {"server_id": 68856})
print("Réponse démarrage:", run_res)

print("\n3. Suivi en direct du déroulement du test...")
start_time = time.time()
while time.time() - start_time < 40:
    time.sleep(2)
    status_data = get_json("http://127.0.0.1:8000/api/speedtest/status")
    st = status_data.get("status")
    stage = status_data.get("stage")
    print(f"  -> État: {st:<10} | Étape: {stage}")
    
    if st == "completed":
        res = status_data.get("latest_result")
        print("\n[OK] TEST TERMINE AVEC SUCCES !")
        print(f"  Serveur         : {res.get('server_name')} [ID: {res.get('server_id')}]")
        print(f"  Ping            : {res.get('ping_ms')} ms (Jitter: {res.get('jitter_ms')} ms)")
        print(f"  Download        : {res.get('download_mbps')} Mbps (Latence sous charge: {res.get('download_latency_ms')} ms)")
        print(f"  Upload          : {res.get('upload_mbps')} Mbps (Latence sous charge: {res.get('upload_latency_ms')} ms)")
        print(f"  Perte de paquets: {res.get('packet_loss')}%")
        print(f"  Opérateur (ISP) : {res.get('isp')} [IP: {res.get('external_ip')}]")
        print(f"  Lien Ookla      : {res.get('result_url')}")
        break
    elif st == "error":
        print(f"\n❌ ERREUR: {status_data.get('error_message')}")
        break

print("\n4. Vérification de l'historique dans SQLite...")
hist_data = get_json("http://127.0.0.1:8000/api/speedtest/history")
history_list = hist_data.get("history", [])
print(f"Nombre de tests dans la base: {len(history_list)}")
if history_list:
    first = history_list[0]
    print(f"Dernier test archivé le {first.get('timestamp')}: ↓ {first.get('download_mbps')} Mbps / ↑ {first.get('upload_mbps')} Mbps")
