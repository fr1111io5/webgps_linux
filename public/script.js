// Глобальные переменные
let map, userMarker, watchId = null, trackPoints = [], polyline = null;
let isSimulating = false, simInterval = null, startTime = null;
let lastGpsTime = 0;

// Элементы интерфейса
let startBtn, addMarkerBtn, exportDataBtn, statusDiv, testModeCheckbox, historyList, markerModal, markersList;

// --- ЛОГИКА HUD (ПРАВАЯ ПАНЕЛЬ) ---

function updateHUD() {
    const gpsStatusEl = document.getElementById('hud-gps-status');
    const satEl = document.getElementById('hud-satellites');
    const timeEl = document.getElementById('hud-datetime');

    // 1. Обновление времени
    const now = new Date();
    timeEl.innerText = now.toLocaleString('ru-RU', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    // 2. Логика статуса GPS (цикл 30 сек)
    const seconds = now.getSeconds();
    const cyclePos = seconds % 30; // Позиция в 30-секундном цикле

    if (isSimulating) {
        gpsStatusEl.innerText = "ГОТОВ (СИМУЛЯТОР)";
        gpsStatusEl.className = "info-value status-ready";
        // Спутники в симуляции (рандом 5-120 каждые 5 сек)
        if (seconds % 5 === 0) {
            satEl.innerText = Math.floor(Math.random() * (120 - 5 + 1)) + 5;
        }
    } else if (watchId !== null) {
        // Если GPS реально включен
        if (cyclePos < 5) {
            gpsStatusEl.innerText = "ОБНОВЛЕНИЕ...";
            gpsStatusEl.className = "info-value status-updating";
        } else {
            // Проверяем, летели ли координаты последние 10 сек
            const isAlive = (Date.now() - lastGpsTime) < 10000;
            gpsStatusEl.innerText = isAlive ? "АКТИВЕН" : "ПОИСК...";
            gpsStatusEl.className = isAlive ? "info-value status-ready" : "info-value status-updating";
        }
        // Спутники (в браузере нет прямого API, имитируем реалистично)
        if (seconds % 5 === 0) {
            satEl.innerText = Math.floor(Math.random() * (12 - 4 + 1)) + 4;
        }
    } else {
        gpsStatusEl.innerText = "ОТКЛЮЧЕН";
        gpsStatusEl.className = "info-value status-off";
        satEl.innerText = "0";
    }
}

// --- ФУНКЦИИ УПРАВЛЕНИЯ GPS ---

function updatePosition(position) {
    lastGpsTime = Date.now();
    const { latitude, longitude } = position.coords;
    const latlng = [latitude, longitude];
    trackPoints.push(latlng);

    if (!userMarker) {
        userMarker = L.marker(latlng).addTo(map);
        map.setView(latlng, 16);
        polyline = L.polyline(trackPoints, { color: '#2563eb', weight: 4 }).addTo(map);
    } else {
        userMarker.setLatLng(latlng);
        polyline.setLatLngs(trackPoints);
    }
    if (statusDiv) statusDiv.innerText = `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Точек: ${trackPoints.length}`;
}

async function stopTracking() {
    if (trackPoints.length > 1) {
        const trackData = {
            start: startTime ? startTime.toLocaleString() : new Date().toLocaleString(),
            end: new Date().toLocaleString(),
            points: [...trackPoints],
            id: Date.now()
        };
        
        await fetch('/api/tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trackData)
        });
    }
    if (isSimulating) { clearInterval(simInterval); isSimulating = false; }
    else if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (startBtn) startBtn.innerText = 'Начать отслеживание';
    if (statusDiv) statusDiv.innerText = '⏹️ Сохранено на сервере';
    renderHistory();
}

function toggleGPS() {
    if (watchId === null && !isSimulating) {
        trackPoints = [];
        startTime = new Date();
        if (testModeCheckbox && testModeCheckbox.checked) {
            isSimulating = true;
            startSimulation();
            startBtn.innerText = 'Остановить тест';
        } else {
            watchId = navigator.geolocation.watchPosition(updatePosition, (err) => {
                alert("Ошибка GPS: " + err.message);
            }, { enableHighAccuracy: true });
            startBtn.innerText = 'Остановить GPS';
        }
    } else {
        stopTracking();
    }
}

function startSimulation() {
    const startPos = [55.751244, 37.618423];
    updatePosition({ coords: { latitude: startPos[0], longitude: startPos[1] } });
    simInterval = setInterval(() => {
        const lastPos = userMarker.getLatLng();
        updatePosition({ coords: { 
            latitude: lastPos.lat + (Math.random() - 0.5) * 0.001, 
            longitude: lastPos.lng + (Math.random() - 0.5) * 0.001 
        } });
    }, 2000);
}

// --- МЕТКИ ---

function openMarkerModal() {
    if (markerModal) markerModal.style.display = 'flex';
    const labelInput = document.getElementById('input-label');
    if (labelInput) labelInput.value = `Метка ${new Date().toLocaleTimeString()}`;
}

function useCurrentGPS() {
    if (!userMarker) return alert("GPS не активен!");
    const pos = userMarker.getLatLng();
    addMarkerToMap(document.getElementById('input-label').value, pos.lat, pos.lng);
}

function saveManualMarker() {
    const label = document.getElementById('input-label').value;
    const lat = parseFloat(document.getElementById('input-lat').value);
    const lng = parseFloat(document.getElementById('input-lng').value);
    if (isNaN(lat) || isNaN(lng)) return alert("Ошибка координат");
    addMarkerToMap(label, lat, lng);
}

async function addMarkerToMap(label, lat, lng) {
    L.marker([lat, lng]).addTo(map).bindPopup(label).openPopup();
    if (markerModal) markerModal.style.display = 'none';
    
    const markerData = { lat, lng, label, date: new Date().toLocaleString(), id: Date.now() };
    
    await fetch('/api/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markerData)
    });
    
    renderMarkers();
}

async function renderMarkers() {
    const response = await fetch('/api/markers');
    const markers = await response.json();
    
    if (markersList) {
        markersList.innerHTML = markers.length ? markers.reverse().map(m => `
            <div class="item-card">
                <b>${m.label}</b>
                <small>${m.lat.toFixed(6)}, ${m.lng.toFixed(6)}</small><br>
                <small>${m.date}</small>
                <div style="display:flex; gap:5px; margin-top:8px;">
                    <button onclick="viewMarker(${m.lat}, ${m.lng})" style="padding:5px; font-size:10px; margin:0;">Показать</button>
                    <button onclick="deleteMarker(${m.id})" style="padding:5px; font-size:10px; margin:0; background:#ef4444;">Удалить</button>
                </div>
            </div>
        `).join('') : '<p style="color: #94a3b8; font-size: 12px; text-align: center;">Меток пока нет</p>';
    }
}

window.viewMarker = function(lat, lng) {
    map.setView([lat, lng], 16);
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('menu-toggle').innerText = '☰';
    }
};

window.deleteMarker = async function(id) {
    if (!confirm("Удалить метку?")) return;
    await fetch(`/api/markers/${id}`, { method: 'DELETE' });
    renderMarkers();
};

// --- ИСТОРИЯ И ЭКСПОРТ ---

async function renderHistory() {
    const response = await fetch('/api/tracks');
    const history = await response.json();
    
    if (historyList) {
        historyList.innerHTML = history.length ? history.reverse().map(t => `
            <div class="item-card">
                <b>Маршрут #${t.id.toString().slice(-4)}</b>
                <small>${t.start}</small><br>
                <small>Точек: ${t.points.length}</small>
                <div style="display:flex; gap:5px; margin-top:8px;">
                    <button onclick="viewTrack(${t.id})" style="padding:5px; font-size:10px; margin:0;">Показать</button>
                    <button onclick="deleteTrack(${t.id})" style="padding:5px; font-size:10px; margin:0; background:#ef4444;">Удалить</button>
                </div>
            </div>
        `).join('') : '<p style="color: #94a3b8; font-size: 12px; text-align: center;">История маршрутов пуста</p>';
    }
}

window.viewTrack = async function(id) {
    const response = await fetch('/api/tracks');
    const history = await response.json();
    const track = history.find(t => t.id === id);
    if (track) {
        if (polyline) map.removeLayer(polyline);
        polyline = L.polyline(track.points, { color: '#10b981', weight: 5 }).addTo(map);
        map.fitBounds(polyline.getBounds());
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('menu-toggle').innerText = '☰';
        }
    }
};

window.deleteTrack = async function(id) {
    if (!confirm("Удалить маршрут?")) return;
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' });
    renderHistory();
};

async function exportAllData() {
    const resTracks = await fetch('/api/tracks');
    const history = await resTracks.json();
    const resMarkers = await fetch('/api/markers');
    const markers = await resMarkers.json();
    
    let markersText = "=== AstroMAP GPS МЕТКИ ===\n\n";
    markers.forEach(m => {
        markersText += `Название: ${m.label}\nКоординаты: ${m.lat}, ${m.lng}\nДата: ${m.date}\n---------------------------\n`;
    });

    let tracksText = "=== AstroMAP GPS МАРШРУТЫ ===\n\n";
    history.forEach(t => {
        tracksText += `Маршрут #${t.id}\nНачало: ${t.start}\nКонец: ${t.end}\nТочки:\n`;
        t.points.forEach(p => tracksText += `${p[0]}, ${p[1]}\n`);
        tracksText += "---------------------------\n";
    });

    downloadFile("AstroMAP_Markers.txt", markersText);
    setTimeout(() => downloadFile("AstroMAP_Tracks.txt", tracksText), 500);
}

function downloadFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// --- ИНИЦИАЛИЗАЦИЯ ---

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) registration.unregister();
        });
    }

    map = L.map('map').setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 200);

    startBtn = document.getElementById('start-gps');
    addMarkerBtn = document.getElementById('add-marker');
    exportDataBtn = document.getElementById('export-data');
    statusDiv = document.getElementById('status');
    testModeCheckbox = document.getElementById('test-mode');
    historyList = document.getElementById('history-list');
    markersList = document.getElementById('markers-list');
    markerModal = document.getElementById('marker-modal');

    if (startBtn) startBtn.onclick = toggleGPS;
    if (addMarkerBtn) addMarkerBtn.onclick = openMarkerModal;
    if (exportDataBtn) exportDataBtn.onclick = exportAllData;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            document.getElementById(`tab-${tab}`).style.display = 'block';
            if (tab === 'history') renderHistory();
            if (tab === 'markers') renderMarkers();
        };
    });

    const btnUseGps = document.getElementById('btn-use-gps');
    if (btnUseGps) btnUseGps.onclick = useCurrentGPS;

    const btnManual = document.getElementById('btn-manual-coords');
    if (btnManual) btnManual.onclick = () => document.getElementById('manual-fields').style.display = 'block';

    const btnSave = document.getElementById('btn-save-marker');
    if (btnSave) btnSave.onclick = saveManualMarker;

    const btnCancel = document.getElementById('btn-cancel-marker');
    if (btnCancel) btnCancel.onclick = () => markerModal.style.display = 'none';

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar) {
        menuToggle.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            menuToggle.innerText = sidebar.classList.contains('active') ? '✕' : '☰';
        };
        map.on('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                menuToggle.innerText = '☰';
            }
        });
    }

    ['path-gps', 'path-markers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const saved = localStorage.getItem(id);
            if (saved) el.value = saved;
            el.onchange = (e) => localStorage.setItem(id, e.target.value);
        }
    });

    // Запуск HUD таймера
    setInterval(updateHUD, 1000);
    updateHUD();
});
