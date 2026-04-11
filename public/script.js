// Глобальные переменные
let map, userMarker, watchId = null, trackPoints = [], polyline = null;
let startMarker = null, endMarker = null;
let isSimulating = false, simInterval = null, startTime = null;
let trackingStartTime = null;
let lastGpsTime = 0;
let lastHeading = 0;
let otherUsersMarkers = {}; 
const deviceId = Math.random().toString(36).substring(7);
let currentUser = null;

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.nav-tabs button').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + tabId);
    const targetBtn = document.getElementById('tab-btn-' + tabId);
    
    if (targetTab) targetTab.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');

    if (tabId === 'history') renderHistory();
    if (tabId === 'markers') renderMarkers();
    if (tabId === 'admin-users') renderAdminUsers();
}

// --- GPS И ТРЕКИНГ ---

function toggleTracking() {
    const isTest = document.getElementById('test-mode').checked;
    const btn = document.getElementById('start-gps');

    if (watchId || isSimulating) {
        stopTracking();
        btn.innerText = '🛰️ Начать отслеживание';
        btn.style.background = '';
    } else {
        trackPoints = [];
        if (polyline) map.removeLayer(polyline);
        polyline = L.polyline([], {color: '#00d4ff', weight: 5, opacity: 0.8}).addTo(map);
        
        if (isTest) {
            startSimulation();
        } else {
            startRealTracking();
        }
        trackingStartTime = Date.now();
        btn.innerText = '🛑 Остановить тест';
        btn.style.background = 'linear-gradient(45deg, #ef4444, #7f1d1d)';
    }
    updateHUD();
}

function stopTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (simInterval) clearInterval(simInterval);
    watchId = null;
    isSimulating = false;
    
    if (trackPoints.length > 1) {
        saveTrack(trackPoints);
    }
}

function startSimulation() {
    isSimulating = true;
    let lat = 55.7558, lng = 37.6173;
    simInterval = setInterval(() => {
        lat += (Math.random() - 0.5) * 0.001;
        lng += (Math.random() - 0.5) * 0.001;
        updatePosition({ 
            coords: { 
                latitude: lat, 
                longitude: lng, 
                heading: Math.random() * 360, 
                speed: Math.random() * 15 
            },
            timestamp: Date.now()
        });
    }, 1000);
}

function startRealTracking() {
    if (!navigator.geolocation) return alert("GPS не поддерживается");
    watchId = navigator.geolocation.watchPosition(updatePosition, (err) => console.error(err), {
        enableHighAccuracy: true
    });
}

function updatePosition(pos) {
    const { latitude, longitude, heading, speed } = pos.coords;
    const latlng = [latitude, longitude];

    if (!userMarker) {
        userMarker = L.marker(latlng).addTo(map);
        map.setView(latlng, 15);
    } else {
        userMarker.setLatLng(latlng);
    }

    trackPoints.push({ lat: latitude, lng: longitude, time: pos.timestamp });
    if (polyline) polyline.addLatLng(latlng);

    if (heading != null) {
        lastHeading = heading;
        const arrow = document.getElementById('compass-arrow');
        if (arrow) arrow.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
    }
    
    updateHUD(speed);
}

// --- МЕТКИ ---

function saveManualMarker() {
    const name = document.getElementById('marker-name').value || "Метка";
    let lat, lng;

    const manualInput = document.getElementById('manual-coords-input');
    if (manualInput && manualInput.style.display !== 'none') {
        lat = parseFloat(document.getElementById('manual-lat').value);
        lng = parseFloat(document.getElementById('manual-lng').value);
        if (isNaN(lat) || isNaN(lng)) return alert("Введите корректные координаты");
    } else {
        const pos = userMarker ? userMarker.getLatLng() : map.getCenter();
        lat = pos.lat;
        lng = pos.lng;
    }
    
    const markerData = {
        id: Date.now(),
        name: name,
        lat: lat,
        lng: lng,
        time: new Date().toISOString()
    };

    let markers = JSON.parse(localStorage.getItem('astro_markers') || '[]');
    markers.push(markerData);
    localStorage.setItem('astro_markers', JSON.stringify(markers));
    
    L.marker([lat, lng]).addTo(map).bindPopup(name);
    alert("Метка сохранена");
    
    // Сброс полей
    document.getElementById('marker-name').value = '';
    document.getElementById('manual-lat').value = '';
    document.getElementById('manual-lng').value = '';
    document.getElementById('manual-coords-input').style.display = 'none';
    
    renderMarkers();
}

function renderMarkers() {
    const markers = JSON.parse(localStorage.getItem('astro_markers') || '[]');
    const list = document.getElementById('markers-list');
    if (!list) return;
    list.innerHTML = markers.length ? markers.map(m => `
        <div class="section" style="font-size: 11px; border-left: 2px solid var(--primary);">
            <div style="display:flex; justify-content:space-between;">
                <span style="font-weight:bold; color:var(--primary);">📍 ${m.name}</span>
                <span style="font-size:9px; color:#94a3b8;">${new Date(m.time).toLocaleTimeString()}</span>
            </div>
            <div style="color:#94a3b8; font-size:9px; margin: 5px 0;">${m.lat.toFixed(6)}, ${m.lng.toFixed(6)}</div>
            <div style="display:flex; gap:5px;">
                <button onclick="map.setView([${m.lat}, ${m.lng}], 16)" style="margin:0; padding:2px; font-size:8px; background:#334155;">ПОКАЗАТЬ</button>
                <button onclick="deleteMarker(${m.id})" style="margin:0; padding:2px; font-size:8px; background:#ef4444;">УДАЛИТЬ</button>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; color:#94a3b8;">Меток нет</p>';
}

// --- ЛОГИ ---

function addLog(msg, type = 'info') {
    const list = document.getElementById('admin-logs-list');
    if (!list) return;
    const time = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ef4444' : (type === 'warn' ? '#fef08a' : '#10b981');
    const logEntry = `<div style="margin-bottom:2px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:2px;">
        <span style="color:#94a3b8;">[${time}]</span> <span style="color:${color}">${msg}</span>
    </div>`;
    list.innerHTML = logEntry + list.innerHTML;
    if (list.children.length > 50) list.lastElementChild.remove();
}

function deleteMarker(id) {
    let markers = JSON.parse(localStorage.getItem('astro_markers') || '[]');
    markers = markers.filter(m => m.id !== id);
    localStorage.setItem('astro_markers', JSON.stringify(markers));
    renderMarkers();
}

// --- ЭКСПОРТ И ИСТОРИЯ ---

function saveTrack(points) {
    const track = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        points: points
    };
    let history = JSON.parse(localStorage.getItem('astro_history') || '[]');
    history.push(track);
    localStorage.setItem('astro_history', JSON.stringify(history));
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('astro_history') || '[]');
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = history.length ? history.map(t => `
        <div class="section" style="font-size: 11px; border-left: 2px solid var(--secondary);">
            <div style="font-weight:bold; color:var(--secondary); margin-bottom:5px;">📅 ${t.date}</div>
            <div style="font-size:10px; color:#94a3b8; margin-bottom:8px;">Точек: ${t.points.length}</div>
            <div style="display:flex; gap:5px;">
                <button onclick="viewTrack(${t.id})" style="margin:0; padding:4px; font-size:9px; background:#334155;">ПРОСМОТР</button>
                <button onclick="exportGPX(${t.id})" style="margin:0; padding:4px; font-size:9px; background:#10b981;">GPX</button>
                <button onclick="deleteTrack(${t.id})" style="margin:0; padding:4px; font-size:9px; background:#ef4444;">X</button>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; color:#94a3b8;">История пуста</p>';
}

function viewTrack(trackId) {
    const history = JSON.parse(localStorage.getItem('astro_history') || '[]');
    const track = history.find(t => t.id === trackId);
    if (!track) return;

    if (polyline) map.removeLayer(polyline);
    polyline = L.polyline(track.points.map(p => [p.lat, p.lng]), {color: '#bc13fe', weight: 5}).addTo(map);
    map.fitBounds(polyline.getBounds());
    addLog(`Просмотр маршрута от ${track.date}`);
}

function deleteTrack(trackId) {
    if (!confirm("Удалить этот маршрут?")) return;
    let history = JSON.parse(localStorage.getItem('astro_history') || '[]');
    history = history.filter(t => t.id !== trackId);
    localStorage.setItem('astro_history', JSON.stringify(history));
    renderHistory();
    addLog("Маршрут удален");
}

function exportGPX(trackId) {
    const history = JSON.parse(localStorage.getItem('astro_history') || '[]');
    const track = history.find(t => t.id === trackId);
    if (!track) return;

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AstroMAP">
  <trk><name>Track ${track.date}</name><trkseg>`;
    
    track.points.forEach(p => {
        gpx += `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.time).toISOString()}</time></trkpt>`;
    });
    
    gpx += `</trkseg></trk></gpx>`;
    
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `track_${trackId}.gpx`;
    a.click();
}

// --- СИСТЕМА СИГНАЛОВ И КАМЕРА ---

async function updateLiveStatus() {
    const currentPos = userMarker ? userMarker.getLatLng() : null;
    try {
        const response = await fetch('/api/live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                lat: currentPos ? currentPos.lat : null,
                lng: currentPos ? currentPos.lng : null,
                heading: lastHeading,
                name: currentUser?.login || 'Гость'
            })
        });
        
        const data = await response.json();
        
        if (currentUser?.role !== 'admin' && data.command === 'start_camera') {
            startBroadcasting();
        }

    // Оптимизация отрисовки через RequestAnimationFrame
    let animationFrame;
    function scheduleUpdate() {
        if (animationFrame) return;
        animationFrame = requestAnimationFrame(() => {
            updateAdminRadar(data.users);
            animationFrame = null;
        });
    }

    if (currentUser?.role === 'admin' && data.users) {
        scheduleUpdate();
        
        // ОЧИСТКА: Удаляем маршруты пользователей, которые ушли из сети
            Object.keys(otherUsersMarkers).forEach(id => {
                if (id.endsWith('_route') || id.endsWith('_actual')) {
                    const userId = id.split('_')[0];
                    if (!data.users[userId]) {
                        map.removeLayer(otherUsersMarkers[id]);
                        delete otherUsersMarkers[id];
                    }
                } else if (!data.users[id]) {
                    // Удаляем самого маркер-пользователя
                    map.removeLayer(otherUsersMarkers[id]);
                    delete otherUsersMarkers[id];
                }
            });
        }
    } catch (e) { console.error(e); }
}

function updateAdminRadar(users) {
    Object.keys(users).forEach(id => {
        if (id === deviceId) return;
        const u = users[id];
        if (u && u.lat != null && u.lng != null) {
            const rotation = u.heading || 0;
            const speedKmh = u.speed ? Math.round(u.speed) : 0;
            
            // Отрисовка планового маршрута пользователя
            if (u.routePlan && Array.isArray(u.routePlan)) {
                if (otherUsersMarkers[id + '_route']) {
                    otherUsersMarkers[id + '_route'].setLatLngs(u.routePlan);
                } else {
                    otherUsersMarkers[id + '_route'] = L.polyline(u.routePlan, {
                        color: '#bc13fe', // Ярко-фиолетовый
                        weight: 6,        // Толще
                        dashArray: '10, 15',
                        opacity: 0.8      // Заметнее
                    }).addTo(map);
                }
            }

            // Отрисовка фактического пути (где уже проехал)
            if (u.actualTrack && Array.isArray(u.actualTrack)) {
                if (otherUsersMarkers[id + '_actual']) {
                    otherUsersMarkers[id + '_actual'].setLatLngs(u.actualTrack);
                } else {
                    otherUsersMarkers[id + '_actual'] = L.polyline(u.actualTrack, {
                        color: '#00d4ff', // Ярко-бирюзовый
                        weight: 4,
                        opacity: 0.9
                    }).addTo(map);
                }
            }

            if (otherUsersMarkers[id]) {
                otherUsersMarkers[id].setLatLng([u.lat, u.lng]);
                const iconEl = otherUsersMarkers[id].getElement();
                if (iconEl) {
                    const arrow = iconEl.querySelector('.arrow-icon');
                    const speedLabel = iconEl.querySelector('.speed-label');
                    if (arrow) arrow.style.transform = `rotate(${rotation}deg)`;
                    if (speedLabel) speedLabel.innerText = `${speedKmh} км/ч`;
                }
            } else {
                otherUsersMarkers[id] = L.marker([u.lat, u.lng], {
                    icon: L.divIcon({
                        className: 'custom-user-marker',
                        iconSize: [40, 40],
                        iconAnchor: [20, 20],
                        html: `
                            <div style="position: relative; width: 40px; height: 40px; display: flex; flex-direction: column; align-items: center;">
                                <div class="speed-label" style="background: rgba(0,0,0,0.7); color: white; padding: 1px 4px; border-radius: 4px; font-size: 9px; margin-bottom: 2px; white-space: nowrap;">${speedKmh} км/ч</div>
                                <div class="arrow-icon" style="width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 20px solid #ef4444; transform: rotate(${rotation}deg); transition: transform 0.3s;"></div>
                                <div style="background: white; padding: 1px 4px; border-radius: 4px; font-size: 10px; color: black; font-weight: bold; margin-top: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${u.name}</div>
                            </div>`
                    })
                }).addTo(map);
            }
        }
    });
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function updateHUD(speed = 0) {
    const hudStatus = document.getElementById('hud-gps-status');
    const hudSats = document.getElementById('hud-satellites');
    const hudTime = document.getElementById('hud-time');

    if (hudStatus) {
        hudStatus.innerText = (watchId || isSimulating) ? 'ACTIVE' : 'OFF';
        hudStatus.style.color = (watchId || isSimulating) ? '#10b981' : '#ef4444';
    }
    if (hudSats) {
        hudSats.innerText = isSimulating ? 'SIM' : (watchId ? 'FIX' : '0');
    }
    if (hudTime) {
        hudTime.innerText = new Date().toLocaleTimeString();
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('map').style.filter = isDark ? 'invert(100%) hue-rotate(180deg) brightness(95%)' : 'none';
}

async function renderAdminUsers() {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.innerHTML = users.map(u => `
        <div class="section" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-left: 2px solid #ca8a04;">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:bold; color:#fef08a;">${u.login}</span>
                <span style="font-size:9px; color:#94a3b8;">Роль: ${u.role}</span>
            </div>
            <div style="display:flex; gap:5px;">
                ${currentUser?.role === 'admin' ? `<button onclick="deleteUser('${u.login}')" style="width: auto; padding: 4px 8px; margin: 0; background: #ef4444; font-size:9px;">УДАЛИТЬ</button>` : ''}
            </div>
        </div>
    `).join('');
    addLog("Список пользователей обновлен");
}

async function deleteUser(login) {
    if (!confirm(`Удалить ${login}?`)) return;
    await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login })
    });
    renderAdminUsers();
}

document.addEventListener('DOMContentLoaded', async () => {
    map = L.map('map', { zoomControl: false }).setView([55.7558, 37.6173], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    setTimeout(() => map.invalidateSize(), 500);
    window.addEventListener('resize', () => map.invalidateSize());

    // Привязка кнопок
    const startGpsBtn = document.getElementById('start-gps');
    if (startGpsBtn) startGpsBtn.onclick = toggleTracking;

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) themeToggleBtn.onclick = toggleTheme;

    const addMarkerBtn = document.getElementById('add-marker');
    if (addMarkerBtn) addMarkerBtn.onclick = () => showTab('markers');

    const btnCurrentPos = document.getElementById('btn-current-pos');
    if (btnCurrentPos) btnCurrentPos.onclick = () => {
        document.getElementById('manual-coords-input').style.display = 'none';
        addLog("Выбран режим текущей позиции для метки");
    };

    const btnManualToggle = document.getElementById('btn-manual-toggle');
    if (btnManualToggle) btnManualToggle.onclick = () => {
        const input = document.getElementById('manual-coords-input');
        input.style.display = input.style.display === 'none' ? 'flex' : 'none';
        addLog("Переключение режима ввода координат");
    };

    const btnSaveMarker = document.getElementById('btn-save-marker');
    if (btnSaveMarker) btnSaveMarker.onclick = saveManualMarker;

    const btnCreateUser = document.getElementById('btn-create-user');
    if (btnCreateUser) {
        btnCreateUser.onclick = async () => {
            const login = document.getElementById('new-user-login').value;
            const pass = document.getElementById('new-user-pass').value;
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password: pass })
            });
            if ((await res.json()).success) {
                alert("Создан");
                renderAdminUsers();
            }
        };
    }

    const exportDataBtn = document.getElementById('export-data');
    if (exportDataBtn) exportDataBtn.onclick = () => {
        const history = localStorage.getItem('astro_history') || '[]';
        const markers = localStorage.getItem('astro_markers') || '[]';
        const data = JSON.stringify({ history: JSON.parse(history), markers: JSON.parse(markers) }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'astromap_data.json';
        a.click();
    };

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => {
        localStorage.removeItem('astro_user');
        window.location.href = 'login.html';
    };

    // Проверка пользователя
    try {
        const userRes = await fetch('/api/user/me');
        currentUser = await userRes.json();
        if (currentUser && currentUser.role === 'admin') {
            const adminTabBtn = document.getElementById('tab-btn-admin-users');
            if (adminTabBtn) adminTabBtn.style.display = 'block';
        }
    } catch (e) { console.error("Auth check failed", e); }

    setInterval(updateHUD, 1000);
    setInterval(updateLiveStatus, 3000);
});
