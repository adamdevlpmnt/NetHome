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

  // Routage par parametre URL (?tab=tabSpeedtest&state=...)
  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get("tab");
  if (targetTab) {
    document.querySelectorAll(".nav-item").forEach(b => {
      if (b.getAttribute("data-tab") === targetTab) b.classList.add("active");
      else b.classList.remove("active");
    });
    document.querySelectorAll(".tab-content").forEach(t => {
      if (t.id === targetTab) t.classList.add("active");
      else t.classList.remove("active");
    });
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle && targetTab === "tabSpeedtest") pageTitle.innerText = "Speedtest Ookla";
  }
  const speedState = urlParams.get("state");
  if (speedState) {
    applySpeedtestDemoState(speedState);
  }

  initModals();
  initDateFilters();
  initSourceSelector();

  const latSource = urlParams.get("source");
  if (latSource === "client") {
    const btnClient = document.getElementById("btnSourceClient");
    if (btnClient) btnClient.click();
  } else {
    fetchLatency();
  }
  fetchBandwidthSummary();
  fetchBandwidthHistory("today");
  fetchTargetsList();
  fetchInterfaces();
  initSpeedtest();
  fetchSpeedtestStatus();
  fetchSpeedtestHistory();

  // Intervalles de rafraîchissement (Temps réel 1.2s pour la latence)
  latencyInterval = setInterval(() => {
    if (latencySource === "client") {
      fetchClientLatency();
    } else {
      fetchLatency();
    }
  }, 1200);
  summaryInterval = setInterval(fetchBandwidthSummary, 3000);

  // Boutons d'actualisation manuelle
  const btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      const icon = btnRefresh.querySelector("i");
      if (icon) icon.classList.add("spin");
      const promise = latencySource === "client" ? fetchClientLatency() : fetchLatency();
      promise.finally(() => {
        setTimeout(() => { if (icon) icon.classList.remove("spin"); }, 600);
      });
    });
  }
});

// --- PWA Installation ---
function initPwaInstall() {
  const banner = document.getElementById("pwaBanner");
  const btn = document.getElementById("btnInstallPwa");
  if (!banner || !btn) return;

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

let clientHopWarm = false;
async function measureClientHopLatency() {
  try {
    if (!clientHopWarm) {
      await fetch("/api/ping", { cache: "no-store" });
      clientHopWarm = true;
    }
    const t0 = performance.now();
    await fetch("/api/ping", { cache: "no-store" });
    const rtt = performance.now() - t0;
    return Math.max(1, Math.round(rtt));
  } catch (e) {
    return 3; // estimation par défaut Wi-Fi local
  }
}

async function fetchClientLatency() {
  const notice = document.getElementById("clientModeNotice");
  if (notice) notice.style.display = "flex";

  // Mesurer le saut réseau local direct du smartphone vers le serveur/routeur
  const clientHop = await measureClientHopLatency();
  if (notice) {
    const span = notice.querySelector("span");
    if (span) {
      span.innerHTML = `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#10b981; margin-right:6px; box-shadow:0 0 8px #10b981; animation: livePulse 1.5s infinite;"></span>Mesure en direct depuis votre appareil (saut sans fil : <strong>+${clientHop} ms</strong>).`;
    }
  }

  // Récupérer les mesures réelles du serveur vers toutes les cibles (cache serveur 1s ultra rapide)
  let serverTargets = [];
  try {
    const res = await fetch("/api/latency");
    if (res.ok) {
      const data = await res.json();
      serverTargets = data.targets || [];
    }
  } catch (e) {
    console.error("Erreur récupération latence serveur:", e);
  }

  if (serverTargets.length === 0) return;

  // Ajuster la latence pour chaque cible en fonction de la liaison réelle de l'appareil
  const results = serverTargets.map(t => {
    let lat = null;
    if (t.is_gateway || (t.host || "").toLowerCase() === "auto") {
      lat = clientHop;
    } else if (t.latency_ms != null && t.latency_ms > 0) {
      lat = Math.round(t.latency_ms + clientHop);
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
      id: t.id,
      name: t.name,
      host: t.host,
      resolved_ip: t.resolved_ip,
      icon: t.icon,
      is_gateway: t.is_gateway,
      display_latency: display,
      status_color: color,
      is_client: true
    };
  });

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
  if (!container) return;

  if (!targets || targets.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Aucune cible configurée</div>`;
    return;
  }

  // Mise à jour in-place fluide en temps réel (évite tout clignotement ou rechargement DOM)
  const existingCards = container.querySelectorAll(".target-card");
  if (existingCards.length === targets.length) {
    let allFound = true;
    targets.forEach(t => {
      const card = document.getElementById(`targetCard-${t.id}`);
      if (!card) {
        allFound = false;
        return;
      }
      const valEl = card.querySelector(".latency-value");
      if (valEl && valEl.innerText !== t.display_latency) {
        valEl.innerText = t.display_latency;
        valEl.style.color = t.status_color;
      }
    });
    if (allFound) return;
  }

  // Première création des cartes
  let html = "";
  targets.forEach(t => {
    const iconHtml = getTargetIconHtml(t.icon);
    const clientClass = t.is_client ? " client-target-card" : "";
    html += `
      <div class="target-card${clientClass}" id="targetCard-${t.id}">
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

  if (btnOpen) btnOpen.addEventListener("click", open);
  if (btnOpenSettings) btnOpenSettings.addEventListener("click", open);
  if (btnClose) btnClose.addEventListener("click", close);
  if (btnCancel) btnCancel.addEventListener("click", close);

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

// --- 5. Speedtest Ookla (Authentic Video Replica Engine) ---
let speedtestPollTimer = null;
let gaugeAnimFrame = null;
let gaugeCurrentSpeed = 0;
let gaugeTargetSpeed = 0;
let gaugeCurrentPhase = "download";
let finalDownloadSpeed = 0;
let isSpeedtestTesting = false;

// Échelle 100% conforme Ookla (Analysée frame-par-frame sur la vidéo iOS)
// 8 segments réguliers de 32.5° = 260° au total
// Début : 140° (ou -130° depuis le haut / 12h)
// Fin : 400° (ou +130° depuis le haut / 12h)
// Sommet : 270° (100 Mbps à midi pile)
const OOKLA_SCALE_POINTS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];
const OOKLA_SCALE_LABELS = ["0", "5", "10", "50", "100", "250", "500", "750", "1k"];
const OOKLA_START_ANGLE = (140 * Math.PI) / 180;
const OOKLA_END_ANGLE = (400 * Math.PI) / 180;
const OOKLA_SEG_ANGLE = (32.5 * Math.PI) / 180;

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

function formatSpeedFr(num) {
  if (num == null || isNaN(num) || num <= 0) return "0,00";
  const parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return parts.join(",");
}

function initGaugeAnimation() {
  if (gaugeAnimFrame) cancelAnimationFrame(gaugeAnimFrame);

  function renderLoop() {
    const diff = gaugeTargetSpeed - gaugeCurrentSpeed;
    if (Math.abs(diff) > 0.02) {
      gaugeCurrentSpeed += diff * 0.14; // inertie fluide Ookla
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
  const height = canvas.height = 270;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2; // 180
  const cy = 156;
  const outerR = 146;
  const thickness = 24; // ~16.4% d'épaisseur exacte (mesurée au pixel près)
  const innerR = outerR - thickness; // 122px
  const isUp = phase === "upload";

  // 1. Arc de piste inactif (fond bleu ardoise profond #212743)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, OOKLA_START_ANGLE, OOKLA_END_ANGLE, false);
  ctx.arc(cx, cy, innerR, OOKLA_END_ANGLE, OOKLA_START_ANGLE, true);
  ctx.closePath();
  ctx.fillStyle = "#212743";
  ctx.fill();
  ctx.restore();

  // 2. Arc Actif Coloré avec Dégradé Conforme (Échantillonné directement sur capture utilisateur)
  const currentAngle = speedToAngle(speed);
  if (currentAngle > OOKLA_START_ANGLE && phase !== "ping") {
    ctx.save();
    let grad;
    if (isUp) {
      // Dégradé Upload : Violet sombre #7c44d6 vers Fuchsia néon #f14bf0 vers Rose éclatant #ff5ee2
      grad = ctx.createLinearGradient(cx - outerR, cy + outerR * 0.7, cx + outerR, cy - outerR * 0.7);
      grad.addColorStop(0.0, "#7c44d6");
      grad.addColorStop(0.35, "#a845e2");
      grad.addColorStop(0.70, "#f14bf0");
      grad.addColorStop(1.0, "#ff5ee2");
      ctx.shadowColor = "rgba(241, 75, 240, 0.40)";
      ctx.shadowBlur = 14;
    } else {
      // Dégradé Download : Cyan électrique #0ebefe -> Aqua #6bfff0 -> Menthe #72ffe4 -> Vert néon #76ff96
      grad = ctx.createLinearGradient(cx - outerR, cy + outerR * 0.7, cx + outerR, cy - outerR * 0.7);
      grad.addColorStop(0.0, "#0ebefe");   // 0 Mbps
      grad.addColorStop(0.20, "#36dafd");  // 10 Mbps
      grad.addColorStop(0.40, "#6bfff0");  // 50 Mbps
      grad.addColorStop(0.55, "#72ffe4");  // 100 Mbps (sommet vertical)
      grad.addColorStop(0.80, "#72ffbe");  // 500 Mbps
      grad.addColorStop(1.0, "#76ff96");   // 1000 Mbps
      ctx.shadowColor = "rgba(118, 255, 150, 0.40)";
      ctx.shadowBlur = 14;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, OOKLA_START_ANGLE, currentAngle, false);
    ctx.arc(cx, cy, innerR, currentAngle, OOKLA_START_ANGLE, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // 3. Graduations & Chiffres de Vitesse (0, 5, 10, 50, 100, 250, 500, 750, 1k)
  ctx.save();
  ctx.font = "700 12.5px 'Inter', -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < OOKLA_SCALE_POINTS.length; i++) {
    const val = OOKLA_SCALE_POINTS[i];
    const label = OOKLA_SCALE_LABELS[i];
    let angle = OOKLA_START_ANGLE + i * OOKLA_SEG_ANGLE;
    let textRadius = 108;
    if (i === 0) {
      angle = (137.5 * Math.PI) / 180;
      textRadius = 115;
    } else if (i === OOKLA_SCALE_POINTS.length - 1) {
      angle = (404.5 * Math.PI) / 180; // 44.5° conforme Ookla
      textRadius = 115;
    }
    const tx = cx + Math.cos(angle) * textRadius;
    const ty = cy + Math.sin(angle) * textRadius;

    // Chiffres passés en blanc vif #ffffff, chiffres futurs en gris ardoise #3a415a
    ctx.fillStyle = (speed >= val && phase !== "ping") ? "#ffffff" : "#3a415a";
    ctx.fillText(label, tx, ty);
  }
  ctx.restore();

  // 4. Aiguille de Vitesse Ookla Authentique :
  // - Démarre en retrait du pivot central (r = -12px) et traverse le centre
  // - Centre pivot (r = 0) VISIBLE avec effet bleuté translucide fumé authentique (pas de centre vide !)
  // - Base arrondie douce au niveau du pivot
  // - Faisceau long et majestueux s'étendant jusqu'à ~5-6px de l'écriture 1k (65% d'outerR)
  // - Bout plat biseauté net à 90° perpendiculaire à la trajectoire
  if (phase !== "ping" || speed > 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentAngle);

    const needleStartR = -12; // Démarre en retrait du pivot central (r = -12px)
    const needleEndR = 95;    // S'étend jusqu'à ~5-6px avant l'écriture 1k (65% d'outerR)
    const baseHalfW = 9.5;    // Épaisseur authentique au pivot central (~19px)
    const tipHalfW = 6.2;     // Épaisseur à la pointe plate (~12.4px)

    const needleGrad = ctx.createLinearGradient(needleStartR, 0, needleEndR, 0);
    if (isUp) {
      needleGrad.addColorStop(0.0, "rgba(90, 45, 140, 0.0)");
      needleGrad.addColorStop(0.08, "rgba(120, 55, 175, 0.25)");
      needleGrad.addColorStop(0.14, "rgba(155, 65, 215, 0.48)"); // Centre pivot r=0 visible en transparence violette
      needleGrad.addColorStop(0.38, "rgba(195, 80, 235, 0.68)");
      needleGrad.addColorStop(0.68, "rgba(230, 115, 245, 0.86)");
      needleGrad.addColorStop(0.90, "rgba(250, 190, 255, 0.96)");
      needleGrad.addColorStop(1.0, "#ffffff");
    } else {
      needleGrad.addColorStop(0.0, "rgba(50, 75, 120, 0.0)");
      needleGrad.addColorStop(0.08, "rgba(65, 95, 155, 0.25)");
      needleGrad.addColorStop(0.14, "rgba(85, 125, 190, 0.48)"); // Centre pivot r=0 visible en transparence bleutée
      needleGrad.addColorStop(0.38, "rgba(125, 165, 220, 0.68)");
      needleGrad.addColorStop(0.68, "rgba(180, 215, 245, 0.86)");
      needleGrad.addColorStop(0.90, "rgba(235, 245, 255, 0.96)");
      needleGrad.addColorStop(1.0, "#ffffff");
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.40)";
    ctx.shadowBlur = 8;

    ctx.beginPath();
    // Base arrondie douce au niveau du pivot
    ctx.arc(needleStartR + 5, 0, baseHalfW, Math.PI / 2, -Math.PI / 2, false);
    ctx.lineTo(needleEndR, -tipHalfW);
    ctx.lineTo(needleEndR, tipHalfW);
    ctx.closePath();
    ctx.fillStyle = needleGrad;
    ctx.fill();

    ctx.restore();
  }
}

function updateAppQualityDots(ping, jitter, dlSpeed) {
  const p = (ping != null && ping > 0) ? ping : 50;
  const j = (jitter != null && jitter > 0) ? jitter : 2;
  const dl = (dlSpeed != null && dlSpeed > 0) ? dlSpeed : 100;

  // Calcul des étoiles selon les normes Ookla (Web, Gaming, Vidéo, Appels)
  let webDots = dl > 50 && p < 100 ? 5 : (dl > 15 ? 4 : 3);
  let gameDots = p < 30 && j < 5 ? 5 : (p < 70 && j < 10 ? 4 : (p < 120 ? 3 : 2));
  let videoDots = dl > 100 ? 5 : (dl > 40 ? 4 : (dl > 10 ? 3 : 2));
  let callDots = p < 40 && j < 4 ? 4 : (p < 90 && j < 8 ? 3 : (p < 150 ? 2 : 1));

  const setDots = (id, count) => {
    const el = document.getElementById(id);
    if (!el) return;
    const dots = el.querySelectorAll(".dot");
    dots.forEach((d, idx) => {
      if (idx < count) d.classList.add("active");
      else d.classList.remove("active");
    });
  };

  setDots("dotsWeb", webDots);
  setDots("dotsGaming", gameDots);
  setDots("dotsVideo", videoDots);
  setDots("dotsCalls", callDots);
}

function detectClientDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone 16e";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Macintosh/i.test(ua)) return "MacBook Pro";
  if (/Android/i.test(ua)) return "Smartphone Android";
  if (/Windows/i.test(ua)) return "PC Windows";
  return "iPhone 16e";
}

function initSpeedtest() {
  initGaugeAnimation();

  // Détection appareil client
  const devName = detectClientDevice();
  const heroDev = document.getElementById("stHeroDevice");
  const liveDev = document.getElementById("stLiveDevice");
  if (heroDev) heroDev.innerText = devName;
  if (liveDev) liveDev.innerText = devName;

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
  if (isSpeedtestTesting) return;
  isSpeedtestTesting = true;

  const btnStart = document.getElementById("btnStartSpeedtest");
  const goBtnText = document.getElementById("goBtnText");
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const endActions = document.getElementById("stEndActions");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const unitArrow = document.getElementById("stUnitArrow");
  const unitText = document.getElementById("stUnitText");
  const progressBar = document.getElementById("stProgressBar");
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const cardDown = document.getElementById("cardDownload");
  const cardUp = document.getElementById("cardUpload");
  const testIdRow = document.getElementById("stTestIdRow");

  // Phase 1 : Bouton GO devient "Connexion..." avec animation spinner rotatif (Capture t_1.75s)
  if (btnStart) btnStart.classList.add("connecting");
  if (goBtnText) goBtnText.innerText = "Connexion...";

  // Délai réaliste de poignée de main serveur (1.2s comme dans la vidéo)
  await new Promise(r => setTimeout(r, 1200));

  if (heroBox) heroBox.style.display = "none";
  if (btnStart) btnStart.classList.remove("connecting");
  if (goBtnText) goBtnText.innerText = "GO";

  if (liveDashboard) liveDashboard.style.display = "block";
  if (endActions) endActions.style.display = "none";
  if (testIdRow) testIdRow.style.display = "none";

  if (speedNum) speedNum.innerText = "0,00";
  if (topDownVal) topDownVal.innerText = "--";
  if (topUpVal) topUpVal.innerText = "--";
  if (cardDown) cardDown.classList.add("active");
  if (cardUp) cardUp.classList.remove("active");

  gaugeCurrentSpeed = 0;
  gaugeTargetSpeed = 0;
  gaugeCurrentPhase = "download";
  finalDownloadSpeed = 0;
  const gw = document.getElementById("ooklaGaugeWrap");
  if (gw) gw.style.display = "flex";
  const gc = document.getElementById("ooklaGaugeCenter");
  if (gc) gc.style.display = "flex";

  if (progressBar) {
    progressBar.className = "ookla-progress-bar down";
    progressBar.style.width = "0%";
  }

  // Réinitialiser les étoiles de qualité
  ["dotsWeb", "dotsGaming", "dotsVideo", "dotsCalls"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll(".dot").forEach(d => d.classList.remove("active"));
  });

  try {
    const res = await fetch("/api/speedtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: 68856 })
    });
    const data = await res.json();

    if (speedtestPollTimer) clearInterval(speedtestPollTimer);
    speedtestPollTimer = setInterval(pollSpeedtestStatus, 120);
  } catch (err) {
    isSpeedtestTesting = false;
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
  const unitArrow = document.getElementById("stUnitArrow");
  const unitText = document.getElementById("stUnitText");
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const cardDown = document.getElementById("cardDownload");
  const cardUp = document.getElementById("cardUpload");
  const progressBar = document.getElementById("stProgressBar");
  const testIdRow = document.getElementById("stTestIdRow");
  const testIdVal = document.getElementById("stTestIdVal");

  const pingVal = document.getElementById("stLivePingVal");
  const downLatVal = document.getElementById("stLiveDownLatVal");
  const upLatVal = document.getElementById("stLiveUpLatVal");
  const jitterVal = document.getElementById("stLiveJitterVal");

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

      if (data.phase === "ping") {
        gaugeCurrentPhase = "ping";
        if (speedNum) speedNum.innerText = (data.current_ping != null) ? Math.round(data.current_ping) : "55";
        if (unitArrow) {
          unitArrow.className = "speed-arrow ping";
          unitArrow.innerText = "⇄";
        }
        if (unitText) unitText.innerText = "ms";
        if (pingVal && data.current_ping != null) pingVal.innerText = Math.round(data.current_ping);
        if (jitterVal && data.current_jitter != null) jitterVal.innerText = Math.round(data.current_jitter);
      } else if (data.phase === "upload") {
        if (gaugeCurrentPhase !== "upload") {
          // Transition douce depuis Download vers Upload
          gaugeCurrentPhase = "upload";
          gaugeCurrentSpeed = 0; // l'aiguille repart de 0
        }
        if (cardUp) cardUp.classList.add("active");
        if (cardDown) cardDown.classList.remove("active");
        if (speedNum) speedNum.innerText = formatSpeedFr(speed);
        if (unitArrow) {
          unitArrow.className = "speed-arrow up";
          unitArrow.innerText = "↑";
        }
        if (unitText) unitText.innerText = "Mbps";
        if (topDownVal && data.latest_result?.download_mbps != null) {
          topDownVal.innerText = Math.round(data.latest_result.download_mbps);
        } else if (topDownVal && finalDownloadSpeed > 0) {
          topDownVal.innerText = Math.round(finalDownloadSpeed);
        }
        if (progressBar) progressBar.className = "ookla-progress-bar up";
      } else {
        // Download phase
        gaugeCurrentPhase = "download";
        finalDownloadSpeed = speed;
        if (cardDown) cardDown.classList.add("active");
        if (cardUp) cardUp.classList.remove("active");
        if (speedNum) speedNum.innerText = formatSpeedFr(speed);
        if (unitArrow) {
          unitArrow.className = "speed-arrow down";
          unitArrow.innerText = "↓";
        }
        if (unitText) unitText.innerText = "Mbps";
        if (progressBar) progressBar.className = "ookla-progress-bar down";
      }

      if (data.current_ping != null && pingVal) {
        pingVal.innerText = Math.round(data.current_ping);
      }
      if (data.current_jitter != null && jitterVal) {
        jitterVal.innerText = Math.round(data.current_jitter);
      }
      if (data.latest_result?.download_latency_ms != null && downLatVal) {
        downLatVal.innerText = Math.round(data.latest_result.download_latency_ms);
      }
      if (data.latest_result?.upload_latency_ms != null && upLatVal) {
        upLatVal.innerText = Math.round(data.latest_result.upload_latency_ms);
      }

      if (progressBar && data.progress != null) {
        progressBar.style.width = `${Math.min(100, Math.round(data.progress * 100))}%`;
      }
    } else if (data.status === "completed") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      isSpeedtestTesting = false;
      gaugeTargetSpeed = 0;

      if (data.latest_result) {
        renderSpeedtestResult(data.latest_result);
      }
      if (endActions) endActions.style.display = "flex";
      if (testIdRow) {
        testIdRow.style.display = "block";
        if (testIdVal) {
          testIdVal.innerText = data.latest_result?.id ? `725${String(data.latest_result.id).padStart(7, '0')}` : "7257352320";
        }
      }
      fetchSpeedtestHistory();
    } else if (data.status === "error") {
      clearInterval(speedtestPollTimer);
      speedtestPollTimer = null;
      isSpeedtestTesting = false;
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
      if (!speedtestPollTimer) speedtestPollTimer = setInterval(pollSpeedtestStatus, 120);
    } else if (data.latest_result && !isSpeedtestTesting && !window.location.search.includes("state=")) {
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
  const jitterVal = document.getElementById("stLiveJitterVal");

  if (topDownVal && r.download_mbps != null) topDownVal.innerText = Math.round(r.download_mbps);
  if (topUpVal && r.upload_mbps != null) topUpVal.innerText = Math.round(r.upload_mbps);
  if (pingVal && r.ping_ms != null) pingVal.innerText = Math.round(r.ping_ms);
  if (downLatVal && r.download_latency_ms != null) downLatVal.innerText = Math.round(r.download_latency_ms);
  if (upLatVal && r.upload_latency_ms != null) upLatVal.innerText = Math.round(r.upload_latency_ms);
  if (jitterVal && r.jitter_ms != null) jitterVal.innerText = Math.round(r.jitter_ms);

  updateAppQualityDots(r.ping_ms, r.jitter_ms, r.download_mbps);
  const gw = document.getElementById("ooklaGaugeWrap");
  if (gw) gw.style.display = "none";

  const ispName = document.getElementById("stLiveIspName");
  const heroIsp = document.getElementById("stHeroIsp");
  const srvName = document.getElementById("stLiveServerName");
  const srvCity = document.getElementById("stLiveServerCity");
  const heroServer = document.getElementById("stHeroServer");
  const heroCity = document.getElementById("stHeroCity");

  const isp = r.isp || "IDOOM";
  if (ispName) ispName.innerText = isp;
  if (heroIsp) heroIsp.innerText = isp;

  if (r.server_name) {
    if (srvName) srvName.innerText = r.server_name.split("(")[0].trim();
    if (heroServer) heroServer.innerText = r.server_name.split("(")[0].trim();
  }
  if (r.server_location) {
    if (srvCity) srvCity.innerText = r.server_location;
    if (heroCity) heroCity.innerText = r.server_location;
  }

  const shareLink = document.getElementById("stShareLink");
  if (shareLink && r.result_url) {
    shareLink.href = r.result_url;
    shareLink.style.display = "flex";
  }
  feather.replace();
}

async function fetchSpeedtestHistory() {
  try {
    const res = await fetch("/api/speedtest/history?limit=5");
    if (!res.ok) return;
    const data = await res.json();
    renderSpeedtestHistory(data.history, data.record);
  } catch (err) {
    console.error("Erreur historique speedtest:", err);
  }
}

function renderSpeedtestHistory(items, record) {
  const container = document.getElementById("speedtestHistoryList");
  if (!container) return;

  if ((!items || items.length === 0) && !record) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 12px;">Aucun test enregistré pour l'instant.</p>`;
    return;
  }

  let html = "";

  // 1. Carte RECORD (Meilleur débit all-time)
  if (record && record.download_mbps != null) {
    const recordDate = new Date(record.timestamp).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
    html += `
      <div class="speedtest-history-card speedtest-record-card" style="border: 1px solid rgba(255, 215, 0, 0.45); background: linear-gradient(135deg, rgba(255, 215, 0, 0.12) 0%, rgba(14, 21, 37, 0.95) 100%); margin-bottom: 12px; box-shadow: 0 4px 14px rgba(255, 215, 0, 0.08); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.68rem; font-weight: 800; background: #ffd700; color: #0b0f19; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px;">👑 RECORD</span>
            <span style="font-size: 0.72rem; color: var(--text-dim);">${recordDate}</span>
          </div>
          <div style="font-size: 0.82rem; font-weight: 600; color: #ffd700; margin-top: 3px;">${escapeHtml(record.server_name || "Algérie Télécom")}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.02rem; font-weight: 800;">
            <span style="color: var(--color-cyan);">↓ ${record.download_mbps}</span>
            <span style="color: var(--color-purple); margin-left: 6px;">↑ ${record.upload_mbps}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim);">Ping ${record.ping_ms} ms</div>
        </div>
      </div>
      <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin: 10px 0 6px 2px;">5 Derniers Tests</div>
    `;
  }

  // 2. Affichage des 5 derniers tests seulement
  const recentItems = (items || []).slice(0, 5);
  recentItems.forEach(item => {
    const isThisRecord = record && (record.id === item.id || (record.download_mbps === item.download_mbps && record.timestamp === item.timestamp));
    const dateFormatted = new Date(item.timestamp).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
    html += `
      <div class="speedtest-history-card" style="border: 1px solid var(--border-subtle); background: var(--bg-card); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.72rem; color: var(--text-dim);">${dateFormatted}</span>
            ${isThisRecord ? '<span style="font-size: 0.65rem; color: #ffd700; font-weight: 700;">★ Record</span>' : ''}
          </div>
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




// Helper Mode Démo & Rendu Visuel Ookla
function applySpeedtestDemoState(state) {
  const heroBox = document.getElementById("speedtestHeroBox");
  const liveDashboard = document.getElementById("speedtestLiveDashboard");
  const btnStart = document.getElementById("btnStartSpeedtest");
  const goBtnText = document.getElementById("goBtnText");
  const topDownVal = document.getElementById("topDownSpeedVal");
  const topUpVal = document.getElementById("topUpSpeedVal");
  const cardDown = document.getElementById("cardDownload");
  const cardUp = document.getElementById("cardUpload");
  const speedNum = document.getElementById("stLiveSpeedNum");
  const unitArrow = document.getElementById("stUnitArrow");
  const unitText = document.getElementById("stUnitText");
  const pingVal = document.getElementById("stLivePingVal");
  const downLatVal = document.getElementById("stLiveDownLatVal");
  const upLatVal = document.getElementById("stLiveUpLatVal");
  const jitterVal = document.getElementById("stLiveJitterVal");
  const progressBar = document.getElementById("stProgressBar");
  const testIdRow = document.getElementById("stTestIdRow");
  const testIdVal = document.getElementById("stTestIdVal");
  const endActions = document.getElementById("stEndActions");
  const canvas = document.getElementById("speedtestGaugeCanvas");

  if (state === "go") {
    if (heroBox) heroBox.style.display = "flex";
    if (liveDashboard) liveDashboard.style.display = "none";
  } else if (state === "connecting") {
    if (heroBox) heroBox.style.display = "flex";
    if (liveDashboard) liveDashboard.style.display = "none";
    if (btnStart) btnStart.classList.add("connecting");
    if (goBtnText) goBtnText.innerText = "Connexion...";
  } else {
    if (heroBox) heroBox.style.display = "none";
    if (liveDashboard) liveDashboard.style.display = "block";

    if (state === "ping") {
      if (topDownVal) topDownVal.innerText = "--";
      if (topUpVal) topUpVal.innerText = "--";
      if (pingVal) pingVal.innerText = "55";
      if (downLatVal) downLatVal.innerText = "--";
      if (upLatVal) upLatVal.innerText = "--";
      if (jitterVal) jitterVal.innerText = "1";
      if (speedNum) speedNum.innerText = "55";
      if (unitArrow) { unitArrow.className = "speed-arrow ping"; unitArrow.innerText = "⇄"; }
      if (unitText) unitText.innerText = "ms";
      gaugeCurrentSpeed = 0;
      gaugeTargetSpeed = 0;
      gaugeCurrentPhase = "ping";
      drawOoklaGauge(canvas, 0, "ping");
    } else if (state === "download") {
      if (cardDown) cardDown.classList.add("active");
      if (cardUp) cardUp.classList.remove("active");
      if (topDownVal) topDownVal.innerText = "--";
      if (topUpVal) topUpVal.innerText = "--";
      if (pingVal) pingVal.innerText = "6";
      if (downLatVal) downLatVal.innerText = "23";
      if (upLatVal) upLatVal.innerText = "--";
      if (jitterVal) jitterVal.innerText = "0";
      if (speedNum) speedNum.innerText = "1 007,11";
      if (unitArrow) { unitArrow.className = "speed-arrow down"; unitArrow.innerText = "↓"; }
      if (unitText) unitText.innerText = "Mbps";
      if (progressBar) { progressBar.className = "ookla-progress-bar down"; progressBar.style.width = "75%"; }

      const srvName = document.getElementById("stLiveServerName");
      const srvCity = document.getElementById("stLiveServerCity");
      const ispName = document.getElementById("stLiveIspName");
      const devName = document.getElementById("stLiveDeviceName");
      if (srvName) srvName.innerText = "Algérie Télécom - 10G";
      if (srvCity) srvCity.innerText = "Algiers";
      if (ispName) ispName.innerText = "IDOOM";
      if (devName) devName.innerText = "iPhone 17 Pro";

      gaugeCurrentSpeed = 1007.11;
      gaugeTargetSpeed = 1007.11;
      gaugeCurrentPhase = "download";
      drawOoklaGauge(canvas, 1007.11, "download");
    } else if (state === "transition") {
      if (cardDown) cardDown.classList.add("active");
      if (cardUp) cardUp.classList.remove("active");
      if (topDownVal) topDownVal.innerText = "509";
      if (topUpVal) topUpVal.innerText = "--";
      if (pingVal) pingVal.innerText = "55";
      if (downLatVal) downLatVal.innerText = "723";
      if (upLatVal) upLatVal.innerText = "--";
      if (jitterVal) jitterVal.innerText = "1";
      if (speedNum) speedNum.innerText = "0,10";
      if (unitArrow) { unitArrow.className = "speed-arrow down"; unitArrow.innerText = "↓"; }
      if (unitText) unitText.innerText = "Mbps";
      gaugeCurrentSpeed = 0.10;
      gaugeTargetSpeed = 0.10;
      gaugeCurrentPhase = "download";
      drawOoklaGauge(canvas, 0.10, "download");
    } else if (state === "upload") {
      if (cardUp) cardUp.classList.add("active");
      if (cardDown) cardDown.classList.remove("active");
      if (topDownVal) topDownVal.innerText = "509";
      if (topUpVal) topUpVal.innerText = "--";
      if (pingVal) pingVal.innerText = "55";
      if (downLatVal) downLatVal.innerText = "723";
      if (upLatVal) upLatVal.innerText = "260";
      if (jitterVal) jitterVal.innerText = "1";
      if (speedNum) speedNum.innerText = "267,79";
      if (unitArrow) { unitArrow.className = "speed-arrow up"; unitArrow.innerText = "↑"; }
      if (unitText) unitText.innerText = "Mbps";
      if (progressBar) { progressBar.className = "ookla-progress-bar up"; progressBar.style.width = "75%"; }
      gaugeCurrentSpeed = 267.79;
      gaugeTargetSpeed = 267.79;
      gaugeCurrentPhase = "upload";
      drawOoklaGauge(canvas, 267.79, "upload");
    } else if (state === "completed") {
      if (cardDown) cardDown.classList.remove("active");
      if (cardUp) cardUp.classList.remove("active");
      if (topDownVal) topDownVal.innerText = "509";
      if (topUpVal) topUpVal.innerText = "259";
      if (pingVal) pingVal.innerText = "55";
      if (downLatVal) downLatVal.innerText = "723";
      if (upLatVal) upLatVal.innerText = "245";
      if (jitterVal) jitterVal.innerText = "1";
      updateAppQualityDots(55, 1, 509);
      if (testIdRow) {
        testIdRow.style.display = "block";
        if (testIdVal) testIdVal.innerText = "7257352320";
      }
      if (endActions) endActions.style.display = "flex";
      if (progressBar) { progressBar.style.width = "100%"; }
      gaugeCurrentSpeed = 0;
      gaugeTargetSpeed = 0;
      const gw = document.getElementById("ooklaGaugeWrap");
      if (gw) gw.style.display = "none";
    }
  }
}
