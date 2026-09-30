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
        const canvas = document.getElementById("speedtestGaugeCanvas");
        if (canvas) {
          drawOoklaGauge(canvas, gaugeCurrentSpeed, gaugeCurrentPhase);
        }
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
  let userTargets = [];
  try {
    const res = await fetch("/api/targets");
    if (res.ok) {
      const data = await res.json();
      userTargets = data.targets || [];
    }
  } catch (e) {
    console.error("Erreur récupération cibles utilisateur:", e);
  }

  if (userTargets.length === 0) {
    renderLatencyTargets([]);
    return;
  }

  const container = document.getElementById("targetList");
  // Afficher immédiatement les cibles de l'utilisateur avec l'indicateur "Mesure..."
  const placeholders = userTargets.map(t => ({
    name: t.name,
    host: t.host,
    icon: t.icon,
    display_latency: "Mesure...",
    status_color: "var(--text-dim)",
    is_client: true
  }));
  renderLatencyTargets(placeholders);

  // Sonder chaque cible utilisateur en parallèle depuis ce terminal (smartphone/PC)
  const results = await Promise.all(userTargets.map(async t => {
    let lat = null;
    const rawHost = (t.host || "").trim();
    const isLocal = t.is_gateway || rawHost === "auto" || rawHost === window.location.hostname || rawHost === "127.0.0.1" || rawHost === "localhost";
    
    if (isLocal) {
      // Mesure aller-retour direct du smartphone vers le serveur HomeNetwork/NAS
      lat = await probeClientUrl("/api/ping");
    } else {
      const isExplicitHttp = rawHost.toLowerCase().startsWith("http://");
      const cleanHost = rawHost.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
      if (cleanHost) {
        if (isExplicitHttp && window.location.protocol === "http:") {
          lat = await probeClientUrl(`http://${cleanHost}`);
          if (lat === null) lat = await probeClientUrl(`https://${cleanHost}`);
        } else {
          lat = await probeClientUrl(`https://${cleanHost}`);
          if (lat === null && window.location.protocol === "http:") {
            lat = await probeClientUrl(`http://${cleanHost}`);
          }
        }
      }
    }

    let color = "#ef4444";
    let display = "N/A";
    if (lat !== null) {
      display = `${lat} ms`;
      if (lat < 40) color = "#10b981";
      else if (lat < 90) color = "#00d2ff";
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
// --- 5. Speedtest Ookla (Authentic Capture 2 & 5 Replica Engine) ---
let speedtestPollTimer = null;
let gaugeAnimFrame = null;
let gaugeCurrentSpeed = 0;
let gaugeTargetSpeed = 0;
let gaugeCurrentPhase = "download";
let finalDownloadSpeed = 0;

// Échelle exacte Ookla (Capture 2 & 5) : 8 segments de 30° = 240°
// 0 (150°), 5 (180°), 10 (210°), 50 (240°), 100 (270° sommet), 250 (300°), 500 (330°), 750 (360°), 1000 (390°)
const OOKLA_SCALE_POINTS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];
const OOKLA_START_ANGLE = (150 * Math.PI) / 180;
const OOKLA_END_ANGLE = (390 * Math.PI) / 180;
const OOKLA_SEG_ANGLE = (30 * Math.PI) / 180;

function speedToAngle(mbps) {
  if (mbps <= 0) return OOKLA_START_ANGLE;
  if (mbps >= 1000) return OOKLA_END_ANGLE;

  for (let i = 0; i < OOKLA_SCALE_POINTS.length - 1; i++) {
    const v0 = OOKLA_SCALE_POINTS[i];
    const v1 = OOKLA_SCALE_POINTS[i + 1];
    if (mbps >= v0 && mbps <= v1) {
      const frac = (mbps - v0) / (v1 - v0);
      return OOKLA_START_ANGLE + (i + frac) * OOKLA_SEG_ANGLE;
    }
  }
  return OOKLA_END_ANGLE;
}

function initGaugeAnimation() {
  if (gaugeAnimFrame) cancelAnimationFrame(gaugeAnimFrame);

  function renderLoop() {
    const diff = gaugeTargetSpeed - gaugeCurrentSpeed;
    if (Math.abs(diff) > 0.02) {
      gaugeCurrentSpeed += diff * 0.14; // inertie douce Ookla
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
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = 360;
  const height = canvas.height = 280;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2; // 180
  const cy = 195;
  const outerR = 135;
  const innerR = 108; // 27px d'épaisseur exacte
  const isUp = phase === "upload";

  // 1. Arc de fond sombre Ookla (Capture 2 & 5)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, OOKLA_START_ANGLE, OOKLA_END_ANGLE, false);
  ctx.arc(cx, cy, innerR, OOKLA_END_ANGLE, OOKLA_START_ANGLE, true);
  ctx.closePath();
  ctx.fillStyle = "#181d28";
  ctx.fill();
  ctx.restore();

  // 2. Arc Actif Coloré avec Dégradé Conforme
  const currentAngle = speedToAngle(speed);
  if (currentAngle > OOKLA_START_ANGLE) {
    ctx.save();
    let grad;
    if (isUp) {
      // Dégradé Violet vers Magenta (Capture 5)
      grad = ctx.createLinearGradient(cx - outerR, cy + outerR, cx + outerR, cy - outerR);
      grad.addColorStop(0.0, "#8b3aed");
      grad.addColorStop(0.5, "#b5179e");
      grad.addColorStop(1.0, "#f72585");
      ctx.shadowColor = "rgba(247, 37, 133, 0.45)";
      ctx.shadowBlur = 18;
    } else {
      // Dégradé Cyan vers Vert Menthe (Capture 2)
      grad = ctx.createLinearGradient(cx - outerR, cy + outerR, cx + outerR, cy - outerR);
      grad.addColorStop(0.0, "#00d2ff");
      grad.addColorStop(0.4, "#00e5ff");
      grad.addColorStop(1.0, "#48e596");
      ctx.shadowColor = "rgba(0, 210, 255, 0.45)";
      ctx.shadowBlur = 18;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, OOKLA_START_ANGLE, currentAngle, false);
    ctx.arc(cx, cy, innerR, currentAngle, OOKLA_START_ANGLE, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // 3. Graduations & Chiffres de Vitesse (Capture 2 & 5 : 0, 5, 10, 50, 100, 250, 500, 750, 1000)
  ctx.save();
  ctx.font = "700 13px 'Inter', -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < OOKLA_SCALE_POINTS.length; i++) {
    const val = OOKLA_SCALE_POINTS[i];
    const angle = OOKLA_START_ANGLE + i * OOKLA_SEG_ANGLE;
    const textRadius = innerR - 16;
    const tx = cx + Math.cos(angle) * textRadius;
    const ty = cy + Math.sin(angle) * textRadius;

    // Les chiffres dépassés sont blanc vif, ceux devant l'aiguille sont gris feutré (Capture 2)
    ctx.fillStyle = val <= speed ? "#ffffff" : "#64748b";
    ctx.fillText(val.toString(), tx, ty);
  }
  ctx.restore();

  // 4. Aiguille Trapézoïdale Fumé / Métallique (Capture 2 & 5)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(currentAngle);

  const needleLen = innerR - 6;
  const baseW = 10;
  const tipW = 24;

  const needleGrad = ctx.createLinearGradient(0, 0, needleLen, 0);
  needleGrad.addColorStop(0.0, "rgba(18, 22, 30, 0.95)");
  needleGrad.addColorStop(0.4, "rgba(70, 80, 100, 0.85)");
  needleGrad.addColorStop(1.0, "rgba(165, 180, 205, 0.85)");

  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(0, -baseW / 2);
  ctx.lineTo(needleLen, -tipW / 2);
  ctx.lineTo(needleLen, tipW / 2);
  ctx.lineTo(0, baseW / 2);
  ctx.closePath();
  ctx.fillStyle = needleGrad;
  ctx.fill();

  // Pivot central
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#12151d";
  ctx.fill();
  ctx.strokeStyle = "#252d3d";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function updateAppQualityDots(ping) {
  const p = (ping != null && ping > 0) ? ping : 20;
  let count = 5;
  if (p > 180) count = 1;
  else if (p > 90) count = 2;
  else if (p > 45) count = 3;
  else if (p > 20) count = 4;

  ["dotsWeb", "dotsGaming", "dotsVideo", "dotsCalls"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const dots = el.querySelectorAll(".dot");
    dots.forEach((d, idx) => {
      if (idx < count) d.classList.add("active");
      else d.classList.remove("active");
    });
  });
}

function initSpeedtest() {
  initGaugeAnimation();
  const btnStart = document.getElementById("btnStartSpeedtest");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      startSpeedtestAction();
    });
  }

  const btnRestart = document.getElementById("btnRestartTest");
  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      startSpeedtestAction();
    });
  }
}

async function startSpeedtestAction() {
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const endActions = document.getElementById("stEndActions");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const progressBar = document.getElementById("stProgressBar");
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const colDown = document.getElementById("colDownload");
  const colUp = document.getElementById("colUpload");

  if (heroBox) heroBox.style.display = "none";
  if (liveDashboard) liveDashboard.style.display = "block";
  if (endActions) endActions.style.display = "none";

  if (speedNum) speedNum.innerText = "0.00";
  if (topDownVal) topDownVal.innerText = "0.00";
  if (topUpVal) topUpVal.innerText = "—";
  if (colDown) colDown.classList.add("active");
  if (colUp) colUp.classList.remove("active");

  gaugeCurrentSpeed = 0;
  gaugeTargetSpeed = 0;
  gaugeCurrentPhase = "download";
  finalDownloadSpeed = 0;

  if (progressBar) {
    progressBar.className = "ookla-progress-bar down";
    progressBar.style.width = "0%";
  }

  try {
    const res = await fetch("/api/speedtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: 68856 })
    });
    const data = await res.json();

    if (speedtestPollTimer) clearInterval(speedtestPollTimer);
    speedtestPollTimer = setInterval(pollSpeedtestStatus, 150);
  } catch (err) {
    if (heroBox) heroBox.style.display = "flex";
    if (liveDashboard) liveDashboard.style.display = "none";
    alert("Erreur de communication avec le serveur.");
  }
}

async function pollSpeedtestStatus() {
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const endActions = document.getElementById("stEndActions");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const colDown = document.getElementById("colDownload");
  const colUp = document.getElementById("colUpload");
  const unitArrow = document.getElementById("stUnitArrow");
  const progressBar = document.getElementById("stProgressBar");

  const pingVal = document.getElementById("stLivePingVal");
  const downLatVal = document.getElementById("stLiveDownLatVal");
  const upLatVal = document.getElementById("stLiveUpLatVal");

  try {
    const res = await fetch("/api/speedtest/status");
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === "running") {
      if (heroBox) heroBox.style.display = "none";
      if (liveDashboard) liveDashboard.style.display = "block";
      if (endActions) endActions.style.display = "none";

      const speed = data.current_speed_mbps || 0;
      gaugeTargetSpeed = speed;

      if (speedNum) speedNum.innerText = speed.toFixed(2);

      if (data.phase === "upload") {
        gaugeCurrentPhase = "upload";
        if (colUp) colUp.classList.add("active");
        if (colDown) colDown.classList.remove("active");
        if (topUpVal) topUpVal.innerText = speed.toFixed(2);
        if (topDownVal && data.latest_result?.download_mbps != null) {
          topDownVal.innerText = data.latest_result.download_mbps.toFixed(2);
        }
        if (unitArrow) {
          unitArrow.className = "speed-arrow up";
          unitArrow.innerText = "↑";
        }
        if (progressBar) progressBar.className = "ookla-progress-bar up";
      } else {
        gaugeCurrentPhase = "download";
        finalDownloadSpeed = speed;
        if (colDown) colDown.classList.add("active");
        if (colUp) colUp.classList.remove("active");
        if (topDownVal) topDownVal.innerText = speed.toFixed(2);
        if (topUpVal) topUpVal.innerText = "—";
        if (unitArrow) {
          unitArrow.className = "speed-arrow down";
          unitArrow.innerText = "↓";
        }
        if (progressBar) progressBar.className = "ookla-progress-bar down";
      }

      if (data.current_ping != null && pingVal) {
        pingVal.innerText = data.current_ping;
        updateAppQualityDots(data.current_ping);
      }
      if (data.latest_result?.download_latency_ms != null && downLatVal) {
        downLatVal.innerText = data.latest_result.download_latency_ms;
      }
      if (data.latest_result?.upload_latency_ms != null && upLatVal) {
        upLatVal.innerText = data.latest_result.upload_latency_ms;
      }

      if (progressBar && data.progress != null) {
        progressBar.style.width = `${Math.min(100, Math.round(data.progress * 100))}%`;
      }
    } else if (data.status === "completed") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      gaugeTargetSpeed = 0;

      if (data.latest_result) {
        renderSpeedtestResult(data.latest_result);
      }
      if (endActions) endActions.style.display = "flex";
      fetchSpeedtestHistory();
    } else if (data.status === "error") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      gaugeTargetSpeed = 0;
      if (heroBox) heroBox.style.display = "flex";
      if (liveDashboard) liveDashboard.style.display = "none";
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
      if (!speedtestPollTimer) speedtestPollTimer = setInterval(pollSpeedtestStatus, 150);
    } else if (data.latest_result) {
      renderSpeedtestResult(data.latest_result);
    }
  } catch (err) {}
}

function renderSpeedtestResult(r) {
  if (!r) return;
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const pingVal = document.getElementById("stLivePingVal");
  const downLatVal = document.getElementById("stLiveDownLatVal");
  const upLatVal = document.getElementById("stLiveUpLatVal");

  if (topDownVal && r.download_mbps != null) topDownVal.innerText = r.download_mbps.toFixed(2);
  if (topUpVal && r.upload_mbps != null) topUpVal.innerText = r.upload_mbps.toFixed(2);
  if (pingVal && r.ping_ms != null) {
    pingVal.innerText = r.ping_ms;
    updateAppQualityDots(r.ping_ms);
  }
  if (downLatVal && r.download_latency_ms != null) downLatVal.innerText = r.download_latency_ms;
  if (upLatVal && r.upload_latency_ms != null) upLatVal.innerText = r.upload_latency_ms;

  const ispName = document.getElementById("stLiveIspName");
  const ipAddr = document.getElementById("stLiveIpAddr");
  const srvName = document.getElementById("stLiveServerName");
  const srvCity = document.getElementById("stLiveServerCity");

  if (ispName && r.isp) ispName.innerText = r.isp;
  if (ipAddr && r.external_ip) ipAddr.innerText = r.external_ip;
  if (srvName && r.server_name) srvName.innerText = r.server_name;
  if (srvCity && r.server_location) srvCity.innerText = r.server_location;

  const heroIsp = document.getElementById("stHeroIsp");
  const heroIp = document.getElementById("stHeroIp");
  const heroServer = document.getElementById("stHeroServer");
  const heroCity = document.getElementById("stHeroCity");

  if (heroIsp && r.isp) heroIsp.innerText = r.isp;
  if (heroIp && r.external_ip) heroIp.innerText = r.external_ip;
  if (heroServer && r.server_name) heroServer.innerText = r.server_name;
  if (heroCity && r.server_location) heroCity.innerText = r.server_location;

  const shareLink = document.getElementById("stShareLink");
  if (shareLink && r.result_url) {
    shareLink.href = r.result_url;
    shareLink.style.display = "flex";
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


