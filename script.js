// Blynk Configuration
const BLYNK_AUTH_TOKEN = "XauvhtV0Gb_yV7MK_kZjpXAG7bUuZSpe";
const BLYNK_URL = "https://blynk.cloud/external/api/get?token=" + BLYNK_AUTH_TOKEN;

// DOM Elements
const elSuhuVal = document.getElementById('suhu-val');
const elSuhuBar = document.getElementById('suhu-bar');
const elHeatVal = document.getElementById('heat-val');
const elHeatCircle = document.getElementById('heat-circle');
const elGasVal = document.getElementById('gas-val');
const elGasMeter = document.getElementById('gas-meter');
const elGasSafe = document.getElementById('gas-safe-indicator');
const elGasDanger = document.getElementById('gas-danger-indicator');
const elStatusBadge = document.getElementById('status-badge');
const elSystemBox = document.getElementById('system-status-box');
const elStatusIcon = document.getElementById('status-icon');
const elStatusText = document.getElementById('status-text');
const elStatusDesc = document.getElementById('status-desc');
const elLastUpdate = document.getElementById('last-update');

// Thresholds based on Arduino Code
const HEAT_THRESHOLD = 50.0;
const GAS_THRESHOLD = 200;

async function fetchBlynkData() {
    try {
        // Fetching Connection Status and Datastreams
        const [resConn, resV0, resV1, resV2, resV3] = await Promise.all([
            fetch(`https://blynk.cloud/external/api/isHardwareConnected?token=${BLYNK_AUTH_TOKEN}`),
            fetch(`${BLYNK_URL}&V0`),
            fetch(`${BLYNK_URL}&V1`),
            fetch(`${BLYNK_URL}&V2`),
            fetch(`${BLYNK_URL}&V3`)
        ]);

        if (!resConn.ok || !resV0.ok || !resV1.ok || !resV2.ok || !resV3.ok) {
            throw new Error("Failed to fetch from Blynk");
        }

        const isConnected = (await resConn.text()).trim();
        const suhu = await resV0.text();
        const heat = await resV1.text();
        const gas = await resV2.text();
        const status = await resV3.text();

        // If ESP32 is unplugged, Blynk API returns "false"
        if (isConnected !== "true") {
            setOfflineState();
            return; // Stop updating the UI so it stays offline
        }

        updateDashboard(
            parseFloat(suhu) || 0, 
            parseFloat(heat) || 0, 
            parseInt(gas) || 0, 
            status.replace(/["']/g, "") // Clean string
        );
        
        updateTime();
    } catch (error) {
        console.error("Error connecting to device:", error);
        setOfflineState();
    }
}

function updateDashboard(suhu, heat, gas, statusMsg) {
    // 1. Update Suhu (V0)
    elSuhuVal.innerText = suhu.toFixed(1);
    let suhuPercent = (suhu / 60) * 100; // Assuming 60C is max for visual scaling
    if(suhuPercent > 100) suhuPercent = 100;
    elSuhuBar.style.height = `${suhuPercent}%`;

    // 2. Update Heat Index (V1)
    elHeatVal.innerText = heat.toFixed(1);
    let heatPercent = heat / 60; // Assuming 60 is max for visual scale
    if(heatPercent > 1) heatPercent = 1;
    // Stroke dasharray format: "dash_length, gap_length" -> max is 100 for full circle
    let dashValue = (heatPercent * 100).toFixed(1);
    elHeatCircle.setAttribute('stroke-dasharray', `${dashValue}, 100`);

    // 3. Update Gas PPM (V2)
    elGasVal.innerText = gas;
    let gasPercent = (gas / 500) * 100; // 500 is max scale mapping in Arduino code
    if(gasPercent > 100) gasPercent = 100;
    elGasMeter.style.width = `${gasPercent}%`;
    
    if (gas > GAS_THRESHOLD) {
        elGasMeter.className = "gas-fill danger";
        elGasSafe.classList.remove('active');
        elGasDanger.classList.add('active');
        elGasDanger.querySelector('.task-check span').innerText = 'radio_button_checked';
        elGasSafe.querySelector('.task-check span').innerText = 'radio_button_unchecked';
    } else {
        elGasMeter.className = "gas-fill safe";
        elGasSafe.classList.add('active');
        elGasDanger.classList.remove('active');
        elGasSafe.querySelector('.task-check span').innerText = 'radio_button_checked';
        elGasDanger.querySelector('.task-check span').innerText = 'radio_button_unchecked';
    }

    // 4. Update Status & Alerts (V3 + Logic)
    elStatusBadge.innerText = "Online";
    elStatusBadge.style.background = "rgba(39, 174, 96, 0.2)";
    elStatusBadge.style.borderColor = "var(--safe-green)";
    elStatusBadge.style.color = "#ffffff";

    elSystemBox.className = "status-content"; // reset classes
    
    // Check Status text based on Arduino Code logic
    if (statusMsg.includes("GAS LEAK") || gas > GAS_THRESHOLD) {
        elSystemBox.classList.add("danger-mode");
        elStatusIcon.innerText = "warning";
        elStatusText.innerText = "EVAKUASI SEKARANG!";
        elStatusDesc.innerText = statusMsg || `Kebocoran Gas Terdeteksi: ${gas} PPM. Segera tinggalkan area.`;
    } 
    else if (statusMsg.includes("HIGH HEAT") || heat > HEAT_THRESHOLD) {
        elSystemBox.classList.add("warning-mode");
        elStatusIcon.innerText = "local_fire_department";
        elStatusText.innerText = "ANCAMAN PANAS!";
        elStatusDesc.innerText = statusMsg || `Heat Index mencapai ${heat.toFixed(1)}°C. Risiko tinggi.`;
    } 
    else if (statusMsg.includes("SAFE") || statusMsg.includes("OK")) {
        elSystemBox.classList.add("safe-mode");
        elStatusIcon.innerText = "verified_user";
        elStatusText.innerText = "Area Aman";
        elStatusDesc.innerText = "Parameter Suhu dan Gas berada di ambang batas normal.";
    } 
    else {
        // Default Connected State
        elStatusIcon.innerText = "monitor_heart";
        elStatusText.innerText = statusMsg || "Monitoring Aktif";
        elStatusDesc.innerText = "Data berhasil disinkronisasi.";
    }
}

function setOfflineState() {
    elStatusBadge.innerText = "Offline";
    elStatusBadge.style.background = "rgba(235, 87, 87, 0.2)";
    elStatusBadge.style.borderColor = "var(--danger-red)";
    
    elSystemBox.className = "status-content"; // Reset to dark
    elStatusIcon.innerText = "cloud_off";
    elStatusText.innerText = "Koneksi Terputus";
    elStatusDesc.innerText = "Tidak dapat terhubung ke alat. Periksa koneksi WiFi pada perangkat ESP32.";

    // Make the values zero/dash to visually indicate offline
    elSuhuVal.innerText = "--";
    elSuhuBar.style.height = "0%";
    
    elHeatVal.innerText = "--";
    elHeatCircle.setAttribute('stroke-dasharray', "0, 100");

    elGasVal.innerText = "--";
    elGasMeter.style.width = "0%";
}

function updateTime() {
    const now = new Date();
    elLastUpdate.innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Fetch data periodically (every 2 seconds like Arduino BlynkTimer)
fetchBlynkData();
setInterval(fetchBlynkData, 2000);
