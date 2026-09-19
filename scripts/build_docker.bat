@echo off
REM Script de construction Docker pour HomeNetwork
echo ======================================================
echo  Construction de l'image Docker HomeNetwork
echo ======================================================

set IMAGE_NAME=homenetwork:latest

echo [1/2] Lancement du build Docker...
docker build -t %IMAGE_NAME% .

if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Echec de la construction Docker.
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Construction terminee avec succes !
echo Image disponible : %IMAGE_NAME%
echo.
echo Pour lancer le conteneur en local ou sur TrueNAS :
echo   docker compose up -d
echo ======================================================
pause
