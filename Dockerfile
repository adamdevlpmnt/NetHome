FROM python:3.12-slim

# Dépendances système pour ping (iputils-ping), net-tools, curl et Speedtest officiel Ookla
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    net-tools \
    curl \
    ca-certificates \
    && curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash \
    && apt-get install -y speedtest \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY run.py .

# Création du volume pour la base SQLite
VOLUME ["/app/data"]

EXPOSE 8000

ENV HOST="0.0.0.0"
ENV PORT="8000"

CMD ["python", "run.py"]
