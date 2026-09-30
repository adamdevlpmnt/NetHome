// Application HomeNetwork - Client Frontend

let bandwidthChart = null;
let latencyInterval = null;
let summaryInterval = null;
let deferredPrompt = null;
let latencySource = "server"; // 'server' (TrueNAS) ou 'client' (Appareil actuel 5G/Wi-Fi)

// Initialisation au chargement
document.addEventListener("DOMContentLoaded", () => {
  feather.replace();
  initPwaInstall();
  initTabs();
  initModals();
  initDateFilters();
  initSourceSelector();

  // Chargements initiaux
  fetchLatency();
  fetchBandwidthSummary();
  fetchBandwidthHistory("today");
  fetchTargetsList();
  fetchInterfaces();
  initSpeedtest();
  fetchSpeedtestStatus();
  fetchSpeedtestHistory();

  // Intervalles de rafraîchissement
  latencyInterval = setInterval(() => {
    if (latencySource === "client") {
      fetchClientLatency();
    } else {
      fetchLatency();
    }
  }, 5000);
  summaryInterval = setInterval(fetchBandwidthSummary, 3000);

  // Boutons d'actualisation manuelle
  document.getElementById("btnRefresh").addEventListener("click", () => {
    const icon = document.querySelector("#btnRefresh i");
    if (icon) icon.classList.add("spin");
    const promise = latencySource === "client" ? fetchClientLatency() : fetchLatency();
    promise.finally(() => {
      setTimeout(() => { if (icon) icon.classList.remove("spin"); }, 600);
    });
  });
});

// --- PWA Installation ---
function initPwaInstall() {
  const banner = document.getElementById("pwaBanner");
  const btn = document.getElementById("btnInstallPwa");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add("show");
  });

  btn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      banner.classList.remove("show");
    }
    deferredPrompt = null;
  });
}

// --- Navigation par Onglets ---
function initTabs() {
  const navItems = document.querySelectorAll(".nav-item");
  const tabContents = document.querySelectorAll(".tab-content");
  const pageTitle = document.getElementById("pageTitle");

  navItems.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      
      navItems.forEach(b => b.classList.remove("active"));
      tabContents.forEach(t => t.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(tabId).classList.add("active");

      if (tabId === "tabLatency") {
        pageTitle.innerText = "Network Latency";
      } else if (tabId === "tabSpeedtest") {
        pageTitle.innerText = "Speedtest Ookla";
        fetchSpeedtestStatus();
        fetchSpeedtestHistory();
      } else if (tabId === "tabBandwidth") {
        pageTitle.innerText = "Bande Passante";
        if (bandwidthChart) bandwidthChart.resize();
      } else if (tabId === "tabSettings") {
        pageTitle.innerText = "Configuration";
      }
      feather.replace();
    });
  });
}


// --- Helper Formats ---
function formatBytes(bytes) {
  if (bytes === 0) return "0 o";
  const k = 1024;
  const sizes = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// --- Rendu des Icônes style WiFiman ---
function getTargetIconHtml(iconType) {
  switch (iconType) {
    case "microsoft":
      return `<div class="icon-microsoft"><span></span><span></span><span></span><span></span></div>`;
    case "xbox":
      return `<div class="icon-xbox">X</div>`;
    case "reddit":
      return `<div class="icon-reddit">●</div>`;
    case "router":
      return `<i data-feather="server" style="color: #94a3b8;"></i>`;
    case "dns":
      return `<i data-feather="cpu" style="color: #f59e0b;"></i>`;
    case "cloudflare":
      return `<i data-feather="cloud" style="color: #f97316;"></i>`;
    case "google":
      return `<i data-feather="compass" style="color: #3b82f6;"></i>`;
    default:
      return `<i data-feather="globe" style="color: #94a3b8;"></i>`;
  }
}

// --- 1. Sélecteur de Source & Latence Réseau (WiFiman Style) ---
function initSourceSelector() {
  const btnServer = document.getElementById("btnSourceServer");
  const btnClient = document.getElementById("btnSourceClient");
  const notice = document.getElementById("clientModeNotice");
  const title = document.getElementById("latencyHeaderTitle");

  if (!btnServer || !btnClient) return;

  btnServer.addEventListener("click", () => {
    if (latencySource === "server") return;
    latencySource = "server";
    btnServer.classList.add("active");
    btnClient.classList.remove("active");
    if (notice) notice.style.display = "none";
    if (title) title.innerText = "Cibles & Passerelle (Serveur)";
    fetchLatency();
  });

  btnClient.addEventListener("click", () => {
    if (latencySource === "client") return;
    latencySource = "client";
    btnClient.classList.add("active");
    btnServer.classList.remove("active");
    if (notice) notice.style.display = "flex";
    if (title) title.innerText = "Cibles (Depuis cet appareil)";
    fetchClientLatency();
  });
}

async function probeClientUrl(url, timeoutMs = 3500) {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const sep = url.includes("?") ? "&" : "?";
    await fetch(`${url}${sep}_t=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timer);
    return Math.max(1, Math.round(performance.now() - start));
  } catch (e) {
    return null;
  }
}

async function fetchClientLatency() {
  const clientTargets = [
    {
      id: "srv",
      name: "Serveur Maison (TrueNAS)",
      host: window.location.hostname || "192.168.1.x",
      icon: "server",
      url: "/api/ping"
    },
    {
      id: "cf",
      name: "Cloudflare (1.1.1.1)",
      host: "1.1.1.1",
      icon: "cloudflare",
      url: "https://1.1.1.1/cdn-cgi/trace"
    },
    {
      id: "goog",
      name: "Google (Web & CDN)",
      host: "google.com",
      icon: "google",
      url: "https://www.google.com/generate_204"
    },
    {
      id: "ms",
      name: "Microsoft Services",
      host: "bing.com",
      icon: "microsoft",
      url: "https://www.bing.com/favicon.ico"
    }
  ];

  const container = document.getElementById("targetList");
  if (!container.querySelector(".client-target-card")) {
    const placeholders = clientTargets.map(t => ({
      name: t.name,
      host: t.host,
      icon: t.icon,
      display_latency: "Mesure...",
      status_color: "var(--text-dim)",
      is_client: true
    }));
    renderLatencyTargets(placeholders);
  }

  const results = await Promise.all(clientTargets.map(async t => {
    const lat = await probeClientUrl(t.url);
    let color = "#ef4444";
    let display = "Échec";
    if (lat !== null) {
      display = `${lat} ms`;
      if (lat < 40) color = "#10b981";
      else if (lat < 90) color = "#38bdf8";
      else if (lat < 160) color = "#f59e0b";
      else color = "#ef4444";
    }
    return {
      name: t.name,
      host: t.host,
      icon: t.icon,
      display_latency: display,
      status_color: color,
      is_client: true
    };
  }));

  if (latencySource === "client") {
    renderLatencyTargets(results);
  }
}

async function fetchLatency() {
  try {
    const res = await fetch("/api/latency");
    if (!res.ok) return;
    const data = await res.json();
    if (latencySource === "server") {
      renderLatencyTargets(data.targets);
    }
  } catch (err) {
    console.error("Erreur récupération latence:", err);
  }
}

function renderLatencyTargets(targets) {
  const container = document.getElementById("targetList");
  if (!targets || targets.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Aucune cible configurée</div>`;
    return;
  }

  let html = "";
  targets.forEach(t => {
    const iconHtml = getTargetIconHtml(t.icon);
    const clientClass = t.is_client ? " client-target-card" : "";
    html += `
      <div class="target-card${clientClass}">
        <div class="target-left">
          <div class="target-icon-wrap">${iconHtml}</div>
          <div class="target-info">
            <span class="target-name">${escapeHtml(t.name)}</span>
            <span class="target-ip">${escapeHtml(t.resolved_ip || t.host)}</span>
          </div>
        </div>
        <div class="target-right">
          <span class="latency-value" style="color: ${t.status_color};">${t.display_latency}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  feather.replace();
}

// --- 2. Bande Passante & Synthèse ---
async function fetchBandwidthSummary() {
  try {
    const res = await fetch("/api/bandwidth/summary");
    if (!res.ok) return;
    const data = await res.json();
    
    // Débits instantanés
    document.getElementById("liveDownSpeed").innerText = data.live.download_speed_formatted;
    document.getElementById("liveUpSpeed").innerText = data.live.upload_speed_formatted;

    // Cumuls
    const s = data.summary;
    document.getElementById("sumTodayTotal").innerText = formatBytes(s.today.total);
    document.getElementById("sumTodayDown").innerText = `↓ ${formatBytes(s.today.recv)}`;
    document.getElementById("sumTodayUp").innerText = `↑ ${formatBytes(s.today.sent)}`;

    document.getElementById("sumMonthTotal").innerText = formatBytes(s.month.total);
    document.getElementById("sumMonthDown").innerText = `↓ ${formatBytes(s.month.recv)}`;
    document.getElementById("sumMonthUp").innerText = `↑ ${formatBytes(s.month.sent)}`;

    document.getElementById("sumYearTotal").innerText = formatBytes(s.year.total);
    document.getElementById("sumYearDown").innerText = `↓ ${formatBytes(s.year.recv)}`;
    document.getElementById("sumYearUp").innerText = `↑ ${formatBytes(s.year.sent)}`;
  } catch (err) {
    console.error("Erreur récupération débits:", err);
  }
}

// --- 3. Filtres de Date et Historique Bande Passante ---
function initDateFilters() {
  const pills = document.querySelectorAll(".filter-pill");
  const customBox = document.getElementById("customDateBox");
  const btnApply = document.getElementById("btnApplyFilter");

  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");

      const filterType = pill.getAttribute("data-filter");
      if (filterType === "custom") {
        customBox.style.display = "flex";
      } else {
        customBox.style.display = "none";
        fetchBandwidthHistory(filterType);
      }
    });
  });

  btnApply.addEventListener("click", () => {
    const start = document.getElementById("filterStartDate").value;
    const end = document.getElementById("filterEndDate").value;
    fetchBandwidthHistory("custom", start, end);
  });
}

async function fetchBandwidthHistory(filterType, customStart = null, customEnd = null) {
  let url = "/api/bandwidth/history?";
  const now = new Date();

  if (filterType === "today") {
    const todayStr = now.toISOString().split("T")[0];
    url += `start_date=${todayStr}&end_date=${todayStr}&group_by=day`;
  } else if (filterType === "7days") {
    const past = new Date();
    past.setDate(now.getDate() - 7);
    url += `start_date=${past.toISOString().split("T")[0]}&end_date=${now.toISOString().split("T")[0]}&group_by=day`;
  } else if (filterType === "30days") {
    const past = new Date();
    past.setDate(now.getDate() - 30);
    url += `start_date=${past.toISOString().split("T")[0]}&end_date=${now.toISOString().split("T")[0]}&group_by=day`;
  } else if (filterType === "year") {
    const yearStart = `${now.getFullYear()}-01-01`;
    url += `start_date=${yearStart}&group_by=month`;
  } else if (filterType === "custom") {
    if (customStart) url += `start_date=${customStart}&`;
    if (customEnd) url += `end_date=${customEnd}&`;
    url += "group_by=day";
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    renderBandwidthChart(data.history, data.group_by);
    updatePeriodSummary(data.history, filterType, customStart, customEnd);
  } catch (err) {
    console.error("Erreur historique:", err);
  }
}

function updatePeriodSummary(history, filterType, customStart = null, customEnd = null) {
  let totalRecv = 0;
  let totalSent = 0;
  if (history && Array.isArray(history)) {
    history.forEach(item => {
      totalRecv += item.recv || 0;
      totalSent += item.sent || 0;
    });
  }
  const totalCombined = totalRecv + totalSent;

  let badgeText = "Période active";
  if (filterType === "today") badgeText = "Aujourd'hui";
  else if (filterType === "7days") badgeText = "7 derniers jours";
  else if (filterType === "30days") badgeText = "30 derniers jours";
  else if (filterType === "year") badgeText = `Année ${new Date().getFullYear()}`;
  else if (filterType === "custom") {
    badgeText = (customStart && customEnd) ? `Du ${customStart} au ${customEnd}` : "Période personnalisée";
  }

  const card = document.getElementById("periodSummaryCard");
  const badge = document.getElementById("periodRangeBadge");
  const totalVal = document.getElementById("periodTotalVal");
  const downVal = document.getElementById("periodDownVal");
  const upVal = document.getElementById("periodUpVal");

  if (card) card.style.display = "block";
  if (badge) badge.innerText = badgeText;
  if (totalVal) totalVal.innerText = formatBytes(totalCombined);
  if (downVal) downVal.innerText = `↓ ${formatBytes(totalRecv)}`;
  if (upVal) upVal.innerText = `↑ ${formatBytes(totalSent)}`;
}

function renderBandwidthChart(history, groupBy) {
  const ctx = document.getElementById("bandwidthChart").getContext("2d");

  // Formatage des étiquettes et des valeurs en Mo / Go
  const labels = history.map(item => item.period);
  const downData = history.map(item => (item.recv / (1024 * 1024)).toFixed(1)); // Mo
  const upData = history.map(item => (item.sent / (1024 * 1024)).toFixed(1));   // Mo

  if (bandwidthChart) {
    bandwidthChart.destroy();
  }

  bandwidthChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["Pas de données"],
      datasets: [
        {
          label: "Réception (Mo)",
          data: downData.length ? downData : [0],
          backgroundColor: "#00f0ff",
          borderRadius: 6
        },
        {
          label: "Envoi (Mo)",
          data: upData.length ? upData : [0],
          backgroundColor: "#a855f7",
          borderRadius: 6
        }
      ]

    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#9ca3af", font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} Mo`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#6b7280", font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: "#6b7280", font: { size: 10 } },
          grid: { color: "#1e2430" }
        }
      }
    }
  });
}

// --- 4. Gestion des Cibles & Configuration ---
async function fetchTargetsList() {
  try {
    const res = await fetch("/api/targets");
    if (!res.ok) return;
    const data = await res.json();
    renderManageTargets(data.targets);
  } catch (err) {
    console.error("Erreur récupération liste cibles:", err);
  }
}

function renderManageTargets(targets) {
  const container = document.getElementById("manageTargetsList");
  if (!targets || targets.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">Aucune cible</p>`;
    return;
  }

  let html = "";
  targets.forEach(t => {
    html += `
      <div class="manage-item-card">
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <span style="display:block; font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(t.host)}</span>
        </div>
        <div>
          ${t.is_gateway ? '<span style="font-size: 0.75rem; color: var(--color-blue); margin-right: 8px;">Passerelle</span>' : `
            <button class="btn-icon" onclick="deleteTargetAction(${t.id})" title="Supprimer" style="color: var(--color-red);">
              <i data-feather="trash-2"></i>
            </button>
          `}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
  feather.replace();
}

async function deleteTargetAction(id) {
  if (!confirm("Voulez-vous supprimer cette cible de surveillance ?")) return;
  try {
    await fetch(`/api/targets/${id}`, { method: "DELETE" });
    fetchTargetsList();
    fetchLatency();
  } catch (err) {
    alert("Erreur lors de la suppression");
  }
}

async function fetchInterfaces() {
  try {
    const res = await fetch("/api/interfaces");
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById("interfacesList");
    let html = "";
    data.interfaces.forEach(nic => {
      html += `
        <div class="manage-item-card">
          <div>
            <strong>${escapeHtml(nic.name)}</strong>
            <span style="display:block; font-size: 0.75rem; color: var(--text-muted);">${nic.ips.join(", ") || "Pas d'adresse IP"}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-dim); text-align: right;">
            <div>↓ ${formatBytes(nic.bytes_recv)}</div>
            <div>↑ ${formatBytes(nic.bytes_sent)}</div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    console.error("Erreur interfaces:", err);
  }
}

// --- Modale Ajout Cible ---
function initModals() {
  const modal = document.getElementById("targetModal");
  const btnOpen = document.getElementById("btnAddTarget");
  const btnOpenSettings = document.getElementById("btnAddNewTarget");
  const btnClose = document.getElementById("btnCloseModal");
  const btnCancel = document.getElementById("btnCancelModal");
  const form = document.getElementById("addTargetForm");

  const open = () => modal.classList.add("active");
  const close = () => {
    modal.classList.remove("active");
    form.reset();
  };

  btnOpen.addEventListener("click", open);
  btnOpenSettings.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  btnCancel.addEventListener("click", close);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("targetName").value.trim();
    const host = document.getElementById("targetHost").value.trim();
    const icon = document.getElementById("targetIcon").value;

    if (!name || !host) return;

    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host, icon })
      });
      if (res.ok) {
        close();
        fetchTargetsList();
        fetchLatency();
      }
    } catch (err) {
      alert("Erreur lors de l'ajout de la cible");
    }
  });
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m];
  });
}

// --- 5. Speedtest Ookla (Serveur Algérie Télécom - ID 68856) ---
let speedtestPollTimer = null;
let gaugeAnimFrame = null;
let gaugeCurrentSpeed = 0;
let gaugeTargetSpeed = 0;
let gaugeCurrentPhase = "download";

const SPEED_SCALE = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];

function speedToAngle(mbps) {
  // Semi-circle speedometer: 135 deg (0.75 PI) à 405 deg (2.25 PI) -> 270 deg
  const startAngle = 0.75 * Math.PI;
  const endAngle = 2.25 * Math.PI;
  const totalAngle = endAngle - startAngle;

  if (mbps <= 0) return startAngle;
  if (mbps >= 1000) return endAngle;

  for (let i = 0; i < SPEED_SCALE.length - 1; i++) {
    if (mbps >= SPEED_SCALE[i] && mbps <= SPEED_SCALE[i + 1]) {
      const segFraction = (mbps - SPEED_SCALE[i]) / (SPEED_SCALE[i + 1] - SPEED_SCALE[i]);
      const segAngle = totalAngle / (SPEED_SCALE.length - 1);
      return startAngle + (i + segFraction) * segAngle;
    }
  }
  return endAngle;
}

function initGaugeAnimation() {
  if (gaugeAnimFrame) cancelAnimationFrame(gaugeAnimFrame);

  function renderLoop() {
    const diff = gaugeTargetSpeed - gaugeCurrentSpeed;
    if (Math.abs(diff) > 0.05) {
      gaugeCurrentSpeed += diff * 0.14;
    } else {
      gaugeCurrentSpeed = gaugeTargetSpeed;
    }

    const canvas = document.getElementById("speedtestGaugeCanvas");
    if (canvas) {
      drawOoklaGauge(canvas, gaugeCurrentSpeed, gaugeCurrentPhase);
    }
    gaugeAnimFrame = requestAnimationFrame(renderLoop);
  }
  gaugeAnimFrame = requestAnimationFrame(renderLoop);
}

function drawOoklaGauge(canvas, speed, phase) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height - 52;
  const radius = 118;
  const startAngle = 0.75 * Math.PI;
  const endAngle = 2.25 * Math.PI;
  const totalAngle = endAngle - startAngle;

  const isUp = phase === "upload";
  const mainColor = isUp ? "#a855f7" : "#00f0ff";
  const glowColor = isUp ? "rgba(168, 85, 247, 0.45)" : "rgba(0, 240, 255, 0.45)";

  // 1. Arc de fond subtil
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // 2. Graduations & Labels de vitesse (0, 1, 5, 10, 25, 50, 100, 250, 500, 1k)
  const numSteps = SPEED_SCALE.length;
  for (let i = 0; i < numSteps; i++) {
    const angle = startAngle + (i / (numSteps - 1)) * totalAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Graduation principale
    const tickInner = radius - 8;
    const tickOuter = radius + 2;
    ctx.beginPath();
    ctx.moveTo(cx + cos * tickInner, cy + sin * tickInner);
    ctx.lineTo(cx + cos * tickOuter, cy + sin * tickOuter);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Étiquette numérique
    const labelRadius = radius - 20;
    const lx = cx + cos * labelRadius;
    const ly = cy + sin * labelRadius;
    const text = SPEED_SCALE[i] >= 1000 ? "1k" : SPEED_SCALE[i].toString();

    ctx.save();
    ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx, ly);
    ctx.restore();

    // Sous-graduations
    if (i < numSteps - 1) {
      const nextAngle = startAngle + ((i + 1) / (numSteps - 1)) * totalAngle;
      const midAngle = (angle + nextAngle) / 2;
      const mcos = Math.cos(midAngle);
      const msin = Math.sin(midAngle);
      ctx.beginPath();
      ctx.moveTo(cx + mcos * (radius - 5), cy + msin * (radius - 5));
      ctx.lineTo(cx + mcos * (radius + 1), cy + msin * (radius + 1));
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 3. Arc Actif Lumineux
  const currentAngle = speedToAngle(speed);
  if (currentAngle > startAngle) {
    ctx.save();
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, currentAngle);
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  // 4. Aiguille Tachymétrique Ookla
  const needleAngle = currentAngle;
  const needleLen = radius - 14;
  const needleBase = 5;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(needleAngle);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(0, -needleBase);
  ctx.lineTo(needleLen, 0);
  ctx.lineTo(0, needleBase);
  ctx.lineTo(-12, 0);
  ctx.closePath();

  const needleGrad = ctx.createLinearGradient(0, 0, needleLen, 0);
  needleGrad.addColorStop(0, "#ffffff");
  needleGrad.addColorStop(1, mainColor);
  ctx.fillStyle = needleGrad;
  ctx.fill();

  // Pivot central
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Point blanc au centre
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}

function initSpeedtest() {
  initGaugeAnimation();
  const btnStart = document.getElementById("btnStartSpeedtest");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      startSpeedtestAction();
    });
  }
}

function drawOoklaWave(canvas, points, phase) {
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement.clientWidth;
  const height = canvas.height = canvas.parentElement.clientHeight || 85;

  ctx.clearRect(0, 0, width, height);

  // Lignes de grille horizontales subtiles
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let y = 20; y < height; y += 25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!points || points.length === 0) return;

  const maxVal = Math.max(25, ...points) * 1.15;
  const isUp = phase === "upload";
  const strokeColor = isUp ? "#a855f7" : "#00f0ff";
  const glowColor = isUp ? "rgba(168, 85, 247, 0.45)" : "rgba(0, 240, 255, 0.45)";

  const coords = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * width;
    const y = height - (p / maxVal) * (height - 18) - 6;
    return { x, y };
  });

  if (coords.length === 1) {
    coords.push({ x: width, y: coords[0].y });
  }

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, glowColor);
  grad.addColorStop(1, "rgba(10, 13, 20, 0.0)");

  ctx.beginPath();
  ctx.moveTo(coords[0].x, height);
  ctx.lineTo(coords[0].x, coords[0].y);

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const midX = (p0.x + p1.x) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, midX, (p0.y + p1.y) / 2);
  }
  ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const midX = (p0.x + p1.x) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, midX, (p0.y + p1.y) / 2);
  }
  ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
  ctx.stroke();
  ctx.restore();

  const last = coords[coords.length - 1];
  ctx.save();
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

async function startSpeedtestAction() {
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const resultCard = document.getElementById("speedtestResultCard");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const progressBar = document.getElementById("stProgressBar");
  const canvas = document.getElementById("speedtestLiveCanvas");

  heroBox.style.display = "none";
  liveDashboard.style.display = "block";
  resultCard.style.display = "none";

  speedNum.innerText = "0.0";
  gaugeCurrentSpeed = 0;
  gaugeTargetSpeed = 0;
  gaugeCurrentPhase = "download";
  progressBar.style.width = "0%";

  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  try {
    const res = await fetch("/api/speedtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: 68856 })
    });
    const data = await res.json();
    
    if (speedtestPollTimer) clearInterval(speedtestPollTimer);
    speedtestPollTimer = setInterval(pollSpeedtestStatus, 180);
  } catch (err) {
    heroBox.style.display = "flex";
    liveDashboard.style.display = "none";
    alert("Erreur de communication avec le serveur.");
  }
}

async function pollSpeedtestStatus() {
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const resultCard = document.getElementById("speedtestResultCard");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const phaseBadge = document.getElementById("stLivePhaseBadge");
  const phaseText = document.getElementById("stPhaseText");
  const stageText = document.getElementById("speedtestLiveStageText");
  const progressBar = document.getElementById("stProgressBar");
  const livePing = document.getElementById("stLivePing");
  const liveJitter = document.getElementById("stLiveJitter");
  const canvas = document.getElementById("speedtestLiveCanvas");

  try {
    const res = await fetch("/api/speedtest/status");
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === "running") {
      heroBox.style.display = "none";
      liveDashboard.style.display = "block";
      resultCard.style.display = "none";

      const speed = data.current_speed_mbps || 0;
      speedNum.innerText = speed.toFixed(1);
      gaugeTargetSpeed = speed;

      if (data.current_ping != null) livePing.innerText = `${data.current_ping} ms`;
      if (data.current_jitter != null) liveJitter.innerText = `${data.current_jitter} ms`;
      if (data.progress != null) progressBar.style.width = `${Math.min(100, Math.round(data.progress * 100))}%`;
      stageText.innerText = data.stage || "Mesure en cours...";

      if (data.phase === "upload") {
        gaugeCurrentPhase = "upload";
        phaseBadge.className = "st-phase-badge up";
        phaseText.innerText = "UPLOAD";
        speedNum.className = "st-gauge-speed-num up-phase";
        drawOoklaWave(canvas, data.upload_points || [], "upload");
      } else {
        gaugeCurrentPhase = "download";
        phaseBadge.className = "st-phase-badge down";
        phaseText.innerText = data.phase === "ping" ? "PING / LATENCE" : "DOWNLOAD";
        speedNum.className = "st-gauge-speed-num";
        drawOoklaWave(canvas, data.download_points || [], "download");
      }
    } else if (data.status === "completed") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      gaugeTargetSpeed = 0;

      heroBox.style.display = "flex";
      liveDashboard.style.display = "none";
      resultCard.style.display = "block";

      if (data.latest_result) {
        renderSpeedtestResult(data.latest_result);
      }
      fetchSpeedtestHistory();
    } else if (data.status === "error") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      gaugeTargetSpeed = 0;

      heroBox.style.display = "flex";
      liveDashboard.style.display = "none";
      alert(data.error_message || "Échec du test de débit.");
    }
  } catch (err) {
    console.error("Erreur polling speedtest:", err);
  }
}

async function fetchSpeedtestStatus() {
  try {
    const res = await fetch("/api/speedtest/status");
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === "running") {
      if (!speedtestPollTimer) speedtestPollTimer = setInterval(pollSpeedtestStatus, 180);
    } else if (data.latest_result) {
      renderSpeedtestResult(data.latest_result);
    }
  } catch (err) {}
}

function renderSpeedtestResult(r) {
  const card = document.getElementById("speedtestResultCard");
  if (!card || !r) return;

  card.style.display = "block";
  document.getElementById("stDownloadVal").innerText = r.download_mbps != null ? r.download_mbps : "--";
  document.getElementById("stUploadVal").innerText = r.upload_mbps != null ? r.upload_mbps : "--";
  
  document.getElementById("stDownloadLat").innerText = r.download_latency_ms ? `Latence: ${r.download_latency_ms} ms` : "Latence: --";
  document.getElementById("stUploadLat").innerText = r.upload_latency_ms ? `Latence: ${r.upload_latency_ms} ms` : "Latence: --";

  document.getElementById("stPingVal").innerText = r.ping_ms != null ? `${r.ping_ms} ms` : "--";
  document.getElementById("stJitterVal").innerText = r.jitter_ms != null ? `${r.jitter_ms} ms` : "--";
  document.getElementById("stLossVal").innerText = `${r.packet_loss || 0}%`;

  document.getElementById("stIspInfo").innerText = r.isp || "Algerie Telecom";
  document.getElementById("stIpInfo").innerText = r.external_ip ? `IP: ${r.external_ip}` : "";

  const link = document.getElementById("stShareLink");
  if (r.result_url) {
    link.href = r.result_url;
    link.style.display = "flex";
  } else {
    link.style.display = "none";
  }
  feather.replace();
}

async function fetchSpeedtestHistory() {
  try {
    const res = await fetch("/api/speedtest/history");
    if (!res.ok) return;
    const data = await res.json();
    renderSpeedtestHistory(data.history);
  } catch (err) {
    console.error("Erreur historique speedtest:", err);
  }
}

function renderSpeedtestHistory(items) {
  const container = document.getElementById("speedtestHistoryList");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 12px;">Aucun test enregistré pour l'instant.</p>`;
    return;
  }

  let html = "";
  items.forEach(item => {
    const dateFormatted = new Date(item.timestamp).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
    html += `
      <div class="speedtest-history-card">
        <div>
          <span style="font-size: 0.72rem; color: var(--text-dim);">${dateFormatted}</span>
          <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted);">${escapeHtml(item.server_name || "Algérie Télécom")}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.95rem; font-weight: 700;">
            <span style="color: var(--color-cyan);">↓ ${item.download_mbps}</span>
            <span style="color: var(--color-purple); margin-left: 6px;">↑ ${item.upload_mbps}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim);">Ping ${item.ping_ms} ms</div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}


