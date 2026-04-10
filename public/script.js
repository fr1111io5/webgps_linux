// Глобальные переменные
let map, userMarker, watchId = null, trackPoints = [], polyline = null;
let isSimulating = false, simInterval = null, startTime = null;

// Элементы интерфейса
let startBtn, addMarkerBtn, exportDataBtn, statusDiv, testModeCheckbox, historyList, markerModal, markersList;

// --- ФУНКЦИИ УПРАВЛЕНИЯ GPS ---

function updatePosition(position) {
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

function stopTracking() {
    if (trackPoints.length > 1) {
        const trackData = {
            start: startTime ? startTime.toLocaleString() : new Date().toLocaleString(),
            end: new Date().toLocaleString(),
            points: [...trackPoints],
            id: Date.now()
        };
        const history = JSON.parse(localStorage.getItem('track_history') || '[]');
        history.push(trackData);
        localStorage.setItem('track_history', JSON.stringify(history));
    }
    if (isSimulating) { clearInterval(simInterval); isSimulating = false; }
    else if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (startBtn) startBtn.innerText = 'Начать отслеживание';
    if (statusDiv) statusDiv.innerText = '⏹️ Сохранено';
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

function addMarkerToMap(label, lat, lng) {
    L.marker([lat, lng]).addTo(map).bindPopup(label).openPopup();
    if (markerModal) markerModal.style.display = 'none';
    const markers = JSON.parse(localStorage.getItem('markers') || '[]');
    markers.push({ lat, lng, label, date: new Date().toLocaleString(), id: Date.now() });
    localStorage.setItem('markers', JSON.stringify(markers));
    renderMarkers();
}

function renderMarkers() {
    const markers = JSON.parse(localStorage.getItem('markers') || '[]');
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
};

window.deleteMarker = function(id) {
    if (!confirm("Удалить метку?")) return;
    let markers = JSON.parse(localStorage.getItem('markers') || '[]');
    markers = markers.filter(m => m.id !== id);
    localStorage.setItem('markers', JSON.stringify(markers));
    renderMarkers();
};

// --- ИСТОРИЯ И ЭКСПОРТ ---

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('track_history') || '[]');
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

window.viewTrack = function(id) {
    const history = JSON.parse(localStorage.getItem('track_history') || '[]');
    const track = history.find(t => t.id === id);
    if (track) {
        if (polyline) map.removeLayer(polyline);
        polyline = L.polyline(track.points, { color: '#10b981', weight: 5 }).addTo(map);
        map.fitBounds(polyline.getBounds());
    }
};

window.deleteTrack = function(id) {
    if (!confirm("Удалить маршрут?")) return;
    let history = JSON.parse(localStorage.getItem('track_history') || '[]');
    history = history.filter(t => t.id !== id);
    localStorage.setItem('track_history', JSON.stringify(history));
    renderHistory();
};

function exportAllData() {
    const history = JSON.parse(localStorage.getItem('track_history') || '[]');
    const markers = JSON.parse(localStorage.getItem('markers') || '[]');
    
    // Создаем текстовый файл для меток
    let markersText = "=== AstroMAP GPS МЕТКИ ===\n\n";
    markers.forEach(m => {
        markersText += `Название: ${m.label}\nКоординаты: ${m.lat}, ${m.lng}\nДата: ${m.date}\n---------------------------\n`;
    });

    // Создаем текстовый файл для маршрутов
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
    // Принудительное удаление старых Service Workers, если они остались
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
            }
        });
    }

    map = L.map('map').setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    // Принудительное обновление размера карты после отрисовки
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

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
    
    // Вкладки
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

    // Загрузка путей
    ['path-gps', 'path-markers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const saved = localStorage.getItem(id);
            if (saved) el.value = saved;
            el.onchange = (e) => localStorage.setItem(id, e.target.value);
        }
    });
});
