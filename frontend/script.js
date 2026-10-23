"use strict";

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════

let total = 0;
let shadow = 0;
let safe = 0;
let alerts = 0;
let currentIntervalCount = 0;
let trafficData = [];
let labels = [];
let currentRange = "24H"; 
let trafficChartInst = null;
let riskChartInst = null;
let isReloading = false;
let hasLoadedOnce = false;
let lastTimestamp = null;

// ═══════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════

function initCharts() {
  const tCtx = document.getElementById("trafficChart");
  const rCtx = document.getElementById("riskChart");

  if (!tCtx || !rCtx) return;

  // Traffic Chart
  trafficChartInst = new Chart(tCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Requests",
        data: trafficData,
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.05)",
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#3d5578" },
          grid: { color: "rgba(255,255,255,0.03)" }
        },
        y: {
          ticks: { color: "#3d5578" },
          grid: { color: "rgba(255,255,255,0.03)" }
        }
      }
    }
  });

// Risk Chart Initialization
riskChartInst = new Chart(rCtx, {
  type: "doughnut",
  data: {
    labels: ["Registered", "Shadow"],
    datasets: [{
      data: [0, 0],
      backgroundColor: ["#34d399", "#f87171"], 
      borderWidth: 0,
      hoverOffset: 4
    }]
  },
  options: {
    cutout: "75%", // Slimmer donut look
    plugins: {
      legend: { display: false }
    }
  }
});
}

// ═══════════════════════════════════════════
// UPDATE CARDS
// ═══════════════════════════════════════════

function updateCards() {
  const cards = document.querySelectorAll(".card-value");

  if (cards.length < 4) return;

  cards[0].textContent = total;   // Total APIs / Requests
  cards[1].textContent = shadow;  // Shadow APIs
  cards[2].textContent = alerts;  // High Risk 
  cards[3].textContent = alerts;  // Alerts
}

// ═══════════════════════════════════════════
// INVENTORY TABLE 
// ═══════════════════════════════════════════

function addLogRow(data) {
  const table = document.querySelector("#inventory-table tbody");
  if (!table) return;

  const row = document.createElement("tr");

  row.innerHTML = `
  <td class="endpoint">${data.endpoint}</td>

  <td>
    ${data.risk_score > 70 
      ? '<span class="badge badge-shadow">Shadow</span>' 
      : '<span class="badge badge-registered">Registered</span>'}
  </td>

  <td>
    <span class="method-pill method-${data.method}">
      ${data.method}
    </span>
  </td>

  <td>
    ${data.risk_score > 70 
      ? '<span class="badge badge-high">High</span>' 
      : '<span class="badge badge-low">Low</span>'}
  </td>

  <td>
    ${new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}
  </td>

  <td>
    <span class="status-pill status-${getStatusType(data.status)}">
      ${data.status}
    </span>
  </td>
`;

  table.prepend(row);

  // limit rows
  if (table.children.length > 50) {
    table.removeChild(table.lastChild);
  }
}

// ═══════════════════════════════════════════
// ALERTS TABLE
// ═══════════════════════════════════════════

function addAlert(data) {
  if (data.risk_score <= 70) return;

  const time = new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
  });

  // ─── FULL ALERTS PAGE ───
  const alertsTable = document.querySelector("#alerts-table tbody");
  if (alertsTable) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${time}</td>
      <td class="endpoint">${data.endpoint}</td>
      <td><span class="badge badge-critical">High</span></td>
      <td>Shadow API detected via traffic analysis</td>
      <td style="color:var(--risk-high)">Auto-detected</td>
      <td> <button class="btn-dismiss" onclick="revokeKey('${data.api_key}', this)"> Revoke </button>
        <button class="btn-dismiss" onclick="this.closest('tr').remove()"> Dismiss </button> </td>
    `;

    alertsTable.prepend(row);

    if (alertsTable.children.length > 50) {
      alertsTable.removeChild(alertsTable.lastChild);
    }
  }

  const dashTable = document.querySelector("#dashboard-alerts-table tbody");
  if (dashTable) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${time}</td>
      <td class="endpoint">${data.endpoint}</td>
      <td><span class="badge badge-critical">High</span></td>
      <td>Shadow API detected</td>
      <td>
        <span class="status-pill status-${getStatusType(data.status)}">
          ${data.status}
        </span>
      </td>
    `;

    dashTable.prepend(row);

    if (dashTable.children.length > 5) {
      dashTable.removeChild(dashTable.lastChild);
    }
  }
}

// ═══════════════════════════════════════════
// NOTIFICATION SERVICE
// ═══════════════════════════════════════════

function triggerHighRiskNotification(data) {
  
  // Check if browser notifications are supported/allowed
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  // 1. Get the toggle state from your Settings Page (Shadow API Detection)
  const isDetectionEnabled = document.querySelectorAll('#page-settings .toggle input')[0].checked;
  if (!isDetectionEnabled) return;

  // 2. Create the notification content
  const notification = new Notification("🚨 High Risk API Detected", {
    body: `Endpoint: ${data.endpoint}\nRisk Score: ${data.risk_score}\nThreat: ${data.threat_type || 'Shadow API'}`,
    icon: "/path-to-your-logo.png" // Use your AASDS icon here
  });

  // 3. Navigate to alerts page when clicked
  notification.onclick = () => {
    window.focus();
    navigate('alerts');
  };
}

// ═══════════════════════════════════════════
// UPDATE CHARTS
// ═══════════════════════════════════════════

  function updateCharts(timestamp) {
  const label = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // group by timestamp
  if (labels.length > 0 && labels[labels.length - 1] === label) {
    trafficData[trafficData.length - 1]++;
  } else {
    labels.push(label);
    trafficData.push(1);
  }

  // keep last 15 points
  if (labels.length > 15) {
    labels.shift();
    trafficData.shift();
  }

  // update charts
  if (trafficChartInst) trafficChartInst.update();

  if (riskChartInst) {
  // Index 0: Registered (safe), Index 1: Shadow (shadow)
  riskChartInst.data.datasets[0].data = [safe, shadow];
  riskChartInst.update();
}

  // update counters
  document.getElementById("risk-low-count").textContent = safe;
  document.getElementById("risk-high-count").textContent = shadow;
}

function getStatusType(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (status >= 200) return "success";
  return "neutral";
}
// ═══════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════


function initWebSocket() {
  let ws;

  const statusEl = document.getElementById("ws-status");
  const textEl = document.getElementById("ws-text");

  function setStatus(state) {
    statusEl.classList.remove("ws-connected", "ws-disconnected", "ws-reconnecting");

    if (state === "connected") {
      statusEl.classList.add("ws-connected");
      textEl.textContent = "Connected";
    }

    if (state === "disconnected") {
      statusEl.classList.add("ws-disconnected");
      textEl.textContent = "Disconnected";
    }

    if (state === "reconnecting") {
      statusEl.classList.add("ws-reconnecting");
      textEl.textContent = "Reconnecting...";
    }
  }

  function connect() {
    setStatus("reconnecting");

    ws = new WebSocket("ws://localhost:8000/ws");

    ws.onopen = () => {
          console.log("WebSocket connected");
          setStatus("connected");
    };

    ws.onmessage = (event) => {
      if (isReloading) return;
      if (!hasLoadedOnce) return;

      const data = JSON.parse(event.data);

      const eventTime = new Date(data.timestamp);
      if (lastTimestamp && eventTime <= lastTimestamp) return;

      lastTimestamp = eventTime;

      total++;
      currentIntervalCount++;

      const alertThreshold = parseInt(document.getElementById("threshold-input")?.value) || 70;

      if (data.risk_score > alertThreshold) {
        shadow++;
        alerts++;
        triggerHighRiskNotification(data);
      } else {
        safe++;
      }

      updateCards();
      addLogRow(data);
      addAlert(data);
      addAIAnalysis(data);
      updateCharts(data.timestamp);
      
    };
    ws.onerror = () => {
      setStatus("disconnected");
    };

    ws.onclose = () => {
      setStatus("disconnected");

      // auto reconnect
      setTimeout(connect, 2000);
    };
  }

  connect();
}
// ═══════════════════════════════════════════
// NAVIGATION 
// ═══════════════════════════════════════════

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.querySelector('[data-page="' + page + '"]').classList.add('active');

  document.getElementById('breadcrumb-label').textContent =
    page.charAt(0).toUpperCase() + page.slice(1);
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');

  if (window.innerWidth <= 768) {
    sb.classList.toggle('open');
  } else {
    sb.classList.toggle('collapsed');
    document.querySelector('.main-wrapper').classList.toggle('full');
  }
}
// ═══════════════════════════════════════════
// FILTERING LOGIC 
// ═══════════════════════════════════════════

function filterInventory() {
  const query = document.getElementById("inventory-search").value.toLowerCase();
  const typeFilter = document.getElementById("inventory-filter").value;
  const rows = document.querySelectorAll("#inventory-table tbody tr");

  rows.forEach(row => {
    const endpoint = row.querySelector(".endpoint").textContent.toLowerCase();
    // Select the badge text (Registered or Shadow)
    const typeBadge = row.querySelector(".badge");
    const type = typeBadge ? typeBadge.textContent.trim() : "";

    const matchesSearch = endpoint.includes(query);
    const matchesType = typeFilter === "all" || type === typeFilter;

    // Show row only if both search and type match
    row.style.display = (matchesSearch && matchesType) ? "" : "none";
  });
}

function filterAlerts() {
  const severityFilter = document.getElementById("alerts-filter").value;
  const rows = document.querySelectorAll("#alerts-table tbody tr");

  rows.forEach(row => {
    const severityBadge = row.querySelector(".badge");
    const severity = severityBadge ? severityBadge.textContent.trim() : "";

    const matches = severityFilter === "all" || severity === severityFilter;
    row.style.display = matches ? "" : "none";
  });
}
// ═══════════════════════════════════════════
// DB
// ═══════════════════════════════════════════

async function loadInitialData() {
  
  try {
    isReloading = true;
    const res = await fetch("http://localhost:8000/logs");
    const data = await res.json();
    const filteredData = filterByTimeRange(data);
    

    document.querySelector("#inventory-table tbody").innerHTML = "";
    document.querySelector("#alerts-table tbody").innerHTML = "";
    document.querySelector("#dashboard-alerts-table tbody").innerHTML = "";
    document.querySelector("#ai-table tbody").innerHTML = ""; 
    // reset state
    
      total = 0;
      shadow = 0;
      safe = 0;
      alerts = 0;
      trafficData = [];
      labels = [];
    
    let grouped = {};

    // rebuild from DB
    filteredData.forEach(item => {
      total++;

      const time = new Date(item.timestamp);
      const itemTime = new Date(item.timestamp);

      if (!lastTimestamp || itemTime > lastTimestamp) {
        lastTimestamp = itemTime;
      }

      const label =
        time.getHours() + ":" +
        String(time.getMinutes()).padStart(2, "0");

      if (!grouped[label]) grouped[label] = 0;
      grouped[label]++;

      if (item.risk_score > 70) {
        shadow++;
        alerts++;
      } else {
        safe++;
      }

      addLogRow(item);
      addAlert(item);
      addAIAnalysis(item);
    });

    // rebuild chart
    labels = Object.keys(grouped);
    trafficData = Object.values(grouped);

    // keep last 10 points
    labels = labels.slice(-10);
    trafficData = trafficData.slice(-10);

    // update UI
    updateCards();

    if (trafficChartInst) {
      trafficChartInst.data.labels = labels;
      trafficChartInst.data.datasets[0].data = trafficData;
      trafficChartInst.update();
    }

    if (riskChartInst) {
      riskChartInst.data.datasets[0].data = [safe, shadow];
      riskChartInst.update();
    }
  } catch (err) {
        console.error("Failed to load logs:", err);
      }
      
      isReloading = false;
      hasLoadedOnce = true;
    }

function filterByTimeRange(data) {
  const now = new Date();

  return data.filter(item => {
    const time = new Date(item.timestamp);
    const diff = now - time;

    if (currentRange === "24H") return diff <= 24 * 60 * 60 * 1000;
    if (currentRange === "7D") return diff <= 7 * 24 * 60 * 60 * 1000;
    if (currentRange === "30D") return diff <= 30 * 24 * 60 * 60 * 1000;

    return true;
  });
}

function setRange(range, el) {
  currentRange = range;

  // update UI active state
  document.querySelectorAll(".pill").forEach(btn =>
    btn.classList.remove("active")
  );

  el.classList.add("active");

  // reload data with new filter
  loadInitialData();
}

async function checkSystemHealth() {
    const services = [
        { id: 'health-backend', url: 'http://localhost:8000/logs' },
        { id: 'health-dummy', url: 'http://127.0.0.1:9000/' }
    ];

    for (const service of services) {
        const el = document.getElementById(service.id);
        if (!el) continue;

        try {
            const res = await fetch(service.url, { mode: 'no-cors' });
            el.textContent = "Operational";
            el.className = "status-pill status-success";
        } catch (e) {
            el.textContent = "Offline";
            el.className = "status-pill status-error";
        }
    }
}

// Run health check every 30 seconds
setInterval(checkSystemHealth, 30000);

function wipeFrontendState() {
  if (!confirm("Clear all UI counters and tables? (Database will remain intact)")) return;

  total = 0; shadow = 0; safe = 0; alerts = 0;
  trafficData = []; labels = [];
  
  document.querySelectorAll(".data-table tbody").forEach(t => t.innerHTML = "");
  updateCards();
  
  if (trafficChartInst) {
    trafficChartInst.data.labels = [];
    trafficChartInst.data.datasets[0].data = [];
    trafficChartInst.update();
  }
  
  navigate('dashboard');
}
// ═══════════════════════════════════════════
// AI
// ═══════════════════════════════════════════

function updateAIProvider() {
  const provider = document.getElementById("ai-provider").value;

  // Save locally
  localStorage.setItem("ai_provider", provider);

  // Update UI based on provider
  updateKeyUI(provider);

  // Send to backend
  fetch("http://localhost:8000/set-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ provider })
  })
  .then(res => res.json())
  .then(data => {
    console.log("Backend response:", data);

    // feedback
    const status = document.getElementById("api-key-status");
    if (status) {
      status.innerHTML = `<span class="api-key-success">Switched to ${provider}</span>`;
    }
  })
  .catch(err => {
    console.error("Error setting AI provider:", err);

    const status = document.getElementById("api-key-status");
    if (status) {
      status.innerHTML = `<span class="api-key-error">Failed to switch provider</span>`;
    }
  });
}
function updateKeyUI(provider) {
  const label = document.getElementById("api-key-label");
  const desc = document.getElementById("api-key-desc");
  const input = document.getElementById("api-key-input");

  if (!label || !desc || !input) return;

  if (provider === "openai") {
    label.textContent = "OpenAI API Key";
    desc.textContent = "Used for GPT-based analysis";
    input.placeholder = "sk-...";
  } 
  else if (provider === "anthropic") {
    label.textContent = "Anthropic API Key";
    desc.textContent = "Used for Claude analysis";
    input.placeholder = "sk-ant-...";
  } 
  else if (provider === "gemini") {
    label.textContent = "Gemini API Key";
    desc.textContent = "Used for Google AI analysis";
    input.placeholder = "AIza...";
  }

  // Load saved key
  const keys = JSON.parse(localStorage.getItem("api_keys") || "{}");
  input.value = keys[provider] || "";
}
function saveSingleKey() {
  const provider = document.getElementById("ai-provider").value;
  const key = document.getElementById("api-key-input").value;

  let keys = JSON.parse(localStorage.getItem("api_keys") || "{}");
  keys[provider] = key;
  localStorage.setItem("api_keys", JSON.stringify(keys));

  fetch("http://localhost:8000/set-api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ provider, key })
  })
  .then(res => res.json())
  .then(data => {
    console.log("API KEY RESPONSE:", data);

    alert("API Key saved successfully for " + provider);
  })
  .catch(err => {
    console.error("SAVE KEY ERROR:", err);
    alert("Failed to save API key");
  });
}
function addAIAnalysis(data) {
  const table = document.querySelector("#ai-table tbody");
  if (!table) return;

  // 1. Map scores to your risk variables
  let riskClass = "low";
  if (data.risk_score > 70) riskClass = "high";
  else if (data.risk_score > 40) riskClass = "med";

  // 2. Generate the non-blocky gauge cell
  const scoreGauge = `
    <div class="risk-gauge-container">
      <div class="risk-gauge risk-gauge-${riskClass}" 
           style="--score-pct: ${data.risk_score}%;">
        <span class="risk-score-number">${data.risk_score}</span>
      </div>
    </div>
  `;

  const row = document.createElement("tr");
  row.className = "new-analysis-row"; // For the highlight effect

  row.innerHTML = `
    <td class="endpoint"><code>${data.endpoint}</code></td>
    <td class="monospaced">${data.model || "N/A"}</td>
    <td>${scoreGauge}</td>
    <td>
      <span class="badge ${data.shadow ? 'badge-shadow' : 'badge-registered'}">
        ${data.threat_type}
      </span>
    </td>
    <td class="ai-explanation" title="${data.explanation}">
      ${data.explanation.slice(0, 80)}${data.explanation.length > 80 ? '...' : ''}
    </td>
  `;

  table.prepend(row);

  // Maintenance: Limit to 50 rows
  if (table.children.length > 50) {
    table.removeChild(table.lastChild);
  }
}
// ═══════════════════════════════════════════
// Key Revoker
// ═══════════════════════════════════════════

async function revokeKey(apiKey, btn) {
  if (!apiKey || apiKey === "unknown") {
    alert("No valid API key found");
    return;
  }

  if (!confirm("Revoke this API key?")) return;

  try {
    btn.textContent = "Revoking...";
    btn.disabled = true;

    const res = await fetch("http://localhost:8000/revoke-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        reason: "Manual revoke"
      })
    });

    if (!res.ok) throw new Error();

    btn.textContent = "Revoked";
    btn.style.background = "#555";

  } catch (err) {
    alert("Failed to revoke");
    btn.textContent = "Revoke";
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

(function init() {

  // 🔥 FIRST restore AI settings
  const savedProvider = localStorage.getItem("ai_provider");
  const savedKeys = JSON.parse(localStorage.getItem("api_keys") || "{}");

  if (savedProvider) {
    fetch("http://localhost:8000/set-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ provider: savedProvider })
    })
    .then(() => {
      if (savedKeys[savedProvider]) {
        return fetch("http://localhost:8000/set-api-keys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: savedProvider,
            key: savedKeys[savedProvider]
          })
        });
      }
    })
    .then(() => {
      console.log("AI restored BEFORE system start");
    });
  }
  if ("Notification" in window && Notification.permission !== "granted") {
       Notification.requestPermission();
  }

  // THEN start system
  initCharts();
  loadInitialData();
  initWebSocket();

})();