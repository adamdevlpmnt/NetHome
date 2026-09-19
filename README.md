# 🌐 HomeNetwork

<div align="center">

![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![TrueNAS SCALE](https://img.shields.io/badge/TrueNAS%20SCALE-Optimized-0075FF?logo=truenas&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12%20%7C%203.14-3776AB?logo=python&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Mobile--First-5A0FC8?logo=pwa&logoColor=white)

**Application web mobile-first de surveillance réseau domestique, diagnostic de latence (WiFiman style), test de débit officiel Ookla avec courbe animée en direct et suivi de consommation de bande passante sous SQLite.**

[Fonctionnalités](#-fonctionnalités-clés) • [Déploiement TrueNAS SCALE](#-déploiement-sur-truenas-scale) • [CI/CD GitHub](#-cicd-github-actions--docker) • [Lancement Local](#-lancement-local)

</div>

---

## 📸 Aperçu de l'Interface

* **Style Sombre Épuré (*Dark Mode pure black & slate*)** inspiré de l'application **Ubiquiti WiFiman**.
* **Palette Haute Visibilité :** **`#00f0ff`** (*Cyan Néon*) pour le Download et **`#a855f7`** (*Violet Électrique*) pour l'Upload.
* **PWA Plein Écran :** Raccourci installable sur l'écran d'accueil iPhone et Android sans barre d'adresse.

---

## ✨ Fonctionnalités Clés

### 1. 📶 Latence Réseau (*WiFiman Replica*)
* **Détection automatique de la passerelle :** Mesure de la réactivité locale de votre Box / Routeur (`Gateway` à ~2 ms).
* **Surveillance multi-cibles en continu :** Ping en parallèle de vos services cloud (`bing.com`, `microsoft.com`, `xbox.com`, `reddit.com`, `1.1.1.1`, `8.8.8.8`, `serveurwalpanel.com`).
* **Assainissement strict des URL :** Accepte les URL avec `http://`, `https://`, chemins `/` ou ports sans erreur.
* **Double tentative IPv6 / IPv4 :** Repli automatique vers l'adresse IPv4 si l'IPv6 n'est pas routée.
* **Code couleur dynamique :** Vert fluide (< 70 ms), Orange (latence élevée), Rouge (inaccessible / N/A).

### 2. ⚡ Speedtest Officiel Ookla (*App Version Replica*)
* **Moteur natif Ookla CLI** exécuté localement sur le serveur.
* **Serveur dédié préconfiguré :** Pointé sur **Algérie Télécom - 10G (Algiers, ID: 68856)**.
* **Courbe animée Spline en temps réel :** Graphique avec dégradé vertical néon et tachymètre numérique géant répliquant fidèlement l'application mobile Ookla.
* **Métriques complètes :** Download, Upload, Ping à vide, Jitter, et **Latence sous charge / Bufferbloat**.
* **Historique SQLite :** Conservation de tous les tests avec lien direct vers le certificat `Speedtest.net`.

### 3. 📊 Suivi de Consommation de Bande Passante
* **Débits instantanés :** Vitesse de réception et d'envoi en direct (Mbps / Kbps).
* **Cumuls temporels :** Aujourd'hui, Ce Mois-ci, Cette Année, Tout temps.
* **Filtres de date :** Boutons rapides et sélecteur de dates personnalisées.
* **Base de données SQLite :** Gestion par deltas pour résister aux redémarrages de machine.

---

## 🐬 Déploiement sur TrueNAS SCALE

HomeNetwork est optimisé pour tourner sur **TrueNAS SCALE** via l'interface **Custom App** ou **Docker Compose**.

### Option A : Déploiement via Docker Compose

1. Connectez-vous en SSH à votre serveur TrueNAS SCALE.
2. Créez un dossier pour l'application dans votre pool ZFS (ex: `/mnt/tank/apps/homenetwork`).
3. Copiez le fichier `docker-compose.yml` :

```yaml
version: '3.8'

services:
  homenetwork:
    image: ghcr.io/<VOTRE_USER_GITHUB>/homenetwork:latest
    container_name: homenetwork
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_RAW
      - NET_ADMIN
    environment:
      - HOST=0.0.0.0
      - PORT=8000
      - BANDWIDTH_POLL_INTERVAL=10
      - DEFAULT_SERVER_ID=68856
      - TZ=Africa/Algiers
    volumes:
      - /mnt/tank/apps/homenetwork/data:/app/data
```

4. Lancez le conteneur :
```bash
docker compose up -d
```

> [!IMPORTANT]
> **Pourquoi `network_mode: host` ?**  
> Le mode hôte est indispensable sur TrueNAS SCALE pour que l'application puisse capturer les interfaces réseau physiques réelles de la machine hôte, détecter la passerelle sans surcouche NAT et assurer des débits Speedtest 10G sans goulot d'étranglement.

---

## 🔄 CI/CD GitHub Actions & Docker

Le dépôt intègre un workflow d'intégration continue prêt à l'emploi : [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml).

### Fonctionnement :
1. À chaque `git push` sur la branche `main` (ou via déclenchement manuel `workflow_dispatch`) :
2. GitHub Actions compile automatiquement une image Docker multi-architecture (**`linux/amd64`** et **`linux/arm64`**).
3. L'image est automatiquement publiée sur le registre de conteneurs GitHub (**GitHub Container Registry**) :
   ```
   ghcr.io/<votre-pseudo>/homenetwork:latest
   ```

### Construction locale rapide :
* **Sur Windows :** Double-cliquez sur `scripts/build_docker.bat`
* **Sur Linux / macOS :**
  ```bash
  chmod +x scripts/build_docker.sh
  ./scripts/build_docker.sh
  ```

---

## 💻 Lancement Local (Développement)

```bash
# 1. Installer les dépendances Python
pip install -r requirements.txt

# 2. Démarrer l'application
python run.py
```

* **Accès local :** [http://localhost:8000](http://localhost:8000)
* **Accès smartphone (sur le Wi-Fi local) :** `http://<IP_DU_SERVEUR>:8000`

---

## 📱 Installation Smartphone (PWA)

1. Ouvrez `http://<IP_DU_SERVEUR>:8000` sur votre mobile.
2. **Sur iOS (Safari) :** Appuyez sur **Partager** > **« Sur l'écran d'accueil »**.
3. **Sur Android (Chrome) :** Appuyez sur la bannière **« Installer »** ou **« Ajouter à l'écran d'accueil »**.
4. L'application se lance désormais en plein écran sans barre d'adresse de navigateur.
