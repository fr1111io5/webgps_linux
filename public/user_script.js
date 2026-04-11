let map, userMarker, routingControl, watchId;
let currentPos = null;
let deviceId = Math.random().toString(36).substring(7);

// Инициализация карты
map = L.map('map', { zoomControl: false }).setView([55.7558, 37.6173], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Геолокация
if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude, longitude, speed, heading } = pos.coords;
        currentPos = [latitude, longitude];
        
        if (!userMarker) {
            userMarker = L.marker(currentPos).addTo(map);
            map.setView(currentPos, 16);
        } else {
            userMarker.setLatLng(currentPos);
        }

        document.getElementById('current-speed').innerText = speed ? Math.round(speed * 3.6) : 0;
        
        // Отправка данных на сервер (включая текущий маршрут если есть)
        sendUpdateToServer(latitude, longitude, speed, heading);
    }, err => console.error(err), { enableHighAccuracy: true });
}

// Поиск и построение маршрута
document.getElementById('btn-search').onclick = async () => {
    const query = document.getElementById('search-input').value;
    if (!query) return;

    // Простейший геокодинг через Nominatim
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (data.length > 0) {
        const dest = [data[0].lat, data[0].lon];
        buildRoute(dest);
    } else {
        alert("Место не найдено");
    }
};

function buildRoute(destination) {
    if (routingControl) map.removeControl(routingControl);

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(currentPos[0], currentPos[1]),
            L.latLng(destination[0], destination[1])
        ],
        lineOptions: { styles: [{ color: '#facc15', opacity: 0.8, weight: 6 }] },
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false
    }).on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        document.getElementById('time-left').innerText = Math.round(summary.totalTime / 60) + " мин";
        document.getElementById('dist-left').innerText = (summary.totalDistance / 1000).toFixed(1) + " км";
        
        // Сохраняем план маршрута для отправки админу
        currentRoutePlan = routes[0].coordinates;
    }).addTo(map);
}

let currentRoutePlan = null;
let actualTrack = []; // Фактический путь
let simulationInterval = null;

// Поиск с подсказками
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// ... (предыдущий код поиска остается)

document.getElementById('btn-simulate').onclick = () => {
    if (!currentRoutePlan || currentRoutePlan.length === 0) return alert("Сначала постройте маршрут");
    
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        document.getElementById('btn-simulate').innerText = "Тест";
        return;
    }

    document.getElementById('btn-simulate').innerText = "Стоп";
    let step = 0;
    simulationInterval = setInterval(() => {
        if (step >= currentRoutePlan.length) {
            clearInterval(simulationInterval);
            simulationInterval = null;
            document.getElementById('btn-simulate').innerText = "Тест";
            alert("Тестовый заезд завершен");
            return;
        }

        const point = currentRoutePlan[step];
        const nextPoint = currentRoutePlan[step + 1] || point;
        
        // Рассчитываем примерный угол поворота
        const heading = Math.atan2(nextPoint[1] - point[1], nextPoint[0] - point[0]) * 180 / Math.PI;

        updatePosition({
            coords: {
                latitude: point[0],
                longitude: point[1],
                speed: 15 + Math.random() * 5, // Имитируем скорость 50-70 км/ч
                heading: heading
            },
            timestamp: Date.now()
        });

        step++;
    }, 1000); // Шаг каждую секунду
};

searchInput.oninput = async () => {
    const query = searchInput.value;
    if (query.length < 3) {
        searchResults.style.display = 'none';
        return;
    }

    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    
    if (data.length > 0) {
        searchResults.innerHTML = data.map(item => `
            <div class="search-item" style="padding: 10px; border-bottom: 1px solid #334155; cursor: pointer; color: white; font-size: 13px;">
                ${item.display_name}
            </div>
        `).join('');
        searchResults.style.display = 'block';

        searchResults.querySelectorAll('.search-item').forEach((el, index) => {
            el.onclick = () => {
                const item = data[index];
                searchInput.value = item.display_name;
                searchResults.style.display = 'none';
                buildRoute([item.lat, item.lon]);
            };
        });
    }
};

function buildRoute(destination) {
    if (routingControl) map.removeControl(routingControl);

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(currentPos[0], currentPos[1]),
            L.latLng(destination[0], destination[1])
        ],
        lineOptions: { styles: [{ color: '#facc15', opacity: 0.8, weight: 6 }] },
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false
    }).on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        document.getElementById('time-left').innerText = Math.round(summary.totalTime / 60) + " мин";
        document.getElementById('dist-left').innerText = (summary.totalDistance / 1000).toFixed(1) + " км";
        
        // Упрощаем координаты для передачи JSON
        currentRoutePlan = routes[0].coordinates.map(c => [c.lat, c.lng]);
    }).addTo(map);
}

async function sendUpdateToServer(lat, lng, speed, heading) {
    actualTrack.push([lat, lng]); // Добавляем в пройденный путь
    if (actualTrack.length > 500) actualTrack.shift();

    try {
        await fetch('/api/live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId,
                lat, lng,
                speed: speed ? speed * 3.6 : 0,
                heading,
                routePlan: currentRoutePlan, // План
                actualTrack: actualTrack    // Где уже проехал
            })
        });
    } catch (e) { console.error(e); }
}

document.getElementById('start-route').onclick = () => {
    if (!routingControl) return alert("Сначала выберите маршрут");
    alert("Маршрут запущен! Счастливого пути.");
};
