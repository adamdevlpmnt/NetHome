import urllib.request
import json

def test_endpoints():
    endpoints = [
        ("Page d'accueil", "http://127.0.0.1:8000/"),
        ("Manifest PWA", "http://127.0.0.1:8000/manifest.json"),
        ("Bande Passante Summary", "http://127.0.0.1:8000/api/bandwidth/summary"),
        ("Network Latency", "http://127.0.0.1:8000/api/latency"),
        ("Historique Bande Passante", "http://127.0.0.1:8000/api/bandwidth/history?group_by=day"),
        ("Interfaces Réseau", "http://127.0.0.1:8000/api/interfaces")
    ]
    
    for name, url in endpoints:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as res:
            assert res.status == 200, f"Erreur sur {name}: {res.status}"
            print(f"[TEST REUSSI] {name:<26} -> Code 200")

if __name__ == "__main__":
    test_endpoints()
