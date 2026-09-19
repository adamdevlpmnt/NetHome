#!/usr/bin/env bash
# Script de construction Docker pour HomeNetwork (Linux / TrueNAS / macOS)
set -e

IMAGE_NAME="homenetwork:latest"

echo "======================================================"
echo " Construction de l'image Docker HomeNetwork"
echo "======================================================"

echo "[1/2] Lancement du build Docker..."
docker build -t "${IMAGE_NAME}" .

echo ""
echo "[2/2] Image construite avec succès : ${IMAGE_NAME}"
echo ""
echo "Pour démarrer le conteneur :"
echo "  docker compose up -d"
echo "======================================================"
