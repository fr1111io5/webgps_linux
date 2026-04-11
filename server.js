const express = require('express');
const session = require('express-session');
const path = require('path');
const https = require('https');
const mysql = require('mysql2/promise');
const fs = require('fs');
const { notifyServerStart } = require('./tbot/bot');

const app = express();

const PORT = 3000;

// --- НАСТРОЙКИ MYSQL ---
const dbConfig = {
    host: '0.0.0.0',
    user: 'YOUR_MYSQL_USER',
    password: 'YOUR_MYSQL_PASSWORD', 
    database: 'astromap'
};

let db;

async function initDB() {
    try {
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
        await connection.end();

        db = await mysql.createConnection(dbConfig);
        console.log('✅ Подключено к MySQL (База: astromap)');

        await db.execute(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            login VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(50) NOT NULL,
            role VARCHAR(20) DEFAULT 'user',
            full_name VARCHAR(100) DEFAULT '',
            blocked BOOLEAN DEFAULT FALSE,
            last_lat DOUBLE DEFAULT 0,
            last_lng DOUBLE DEFAULT 0,
            last_speed DOUBLE DEFAULT 0,
            last_heading DOUBLE DEFAULT 0,
            last_seen DATETIME,
            total_time_sec INT DEFAULT 0,
            today_time_sec INT DEFAULT 0,
            last_reset_date DATE,
            device_info TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS tracks (
            id BIGINT PRIMARY KEY,
            user_login VARCHAR(50),
            name VARCHAR(255),
            start_time DATETIME,
            end_time DATETIME,
            distance DOUBLE DEFAULT 0,
            avg_speed DOUBLE DEFAULT 0,
            max_speed DOUBLE DEFAULT 0,
            points LONGTEXT,
            FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS markers (
            id BIGINT PRIMARY KEY,
            user_login VARCHAR(50),
            label VARCHAR(255),
            lat DOUBLE,
            lng DOUBLE,
            category VARCHAR(50) DEFAULT 'general',
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS system_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_login VARCHAR(50),
            action VARCHAR(255),
            ip_address VARCHAR(50),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        const [rows] = await db.execute('SELECT * FROM users WHERE login = "admin"');
        if (rows.length === 0) {
            await db.execute('INSERT INTO users (login, password, role, full_name) VALUES ("admin", "admin", "admin", "Главный Администратор")');
        }
    } catch (err) {
        console.error('❌ Ошибка MySQL:', err.message);
    }
}

initDB();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'astromap-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true }
}));

const authMiddleware = async (req, res, next) => {
    if (req.session.authorized) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login.html');
};


async function logAction(userLogin, action, req) {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await db.execute('INSERT INTO system_logs (user_login, action, ip_address) VALUES (?, ?, ?)', [userLogin, action, ip]);
    } catch (err) { console.error('Log error:', err); }
}

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM users WHERE login = ? AND password = ?', [login, password]);
    
    if (rows.length > 0) {
        const user = rows[0];
        if (user.blocked) return res.status(403).json({ success: false, error: 'Account blocked' });
        
        req.session.authorized = true;
        req.session.user = user.login;
        req.session.role = user.role;
        res.json({ success: true, user: { login: user.login, role: user.role } });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// --- LIVE МОНИТОРИНГ И СИГНАЛИНГ ---
let activeUsers = {};
global.activeUsers = activeUsers; // Делаем доступным для бота
let webrtcSignals = {};

app.post('/api/live', authMiddleware, async (req, res) => {
    const { lat, lng, heading, speed, deviceId } = req.body;
    const userLogin = req.session.user;
    const userRole = req.session.role;

    if (lat && lng) {
        const existingData = activeUsers[deviceId] || {};
        activeUsers[deviceId] = { 
            ...existingData,
            lat, lng, heading, speed, 
            name: userLogin, 
            role: userRole, 
            lastUpdate: Date.now() 
        };
        
        const today = new Date().toISOString().split('T')[0];
        await db.execute(`
            UPDATE users 
            SET last_lat = ?, last_lng = ?, last_speed = ?, last_heading = ?, last_seen = NOW(),
                total_time_sec = total_time_sec + 5,
                today_time_sec = CASE WHEN last_reset_date = ? THEN today_time_sec + 5 ELSE 5 END,
                last_reset_date = ?
            WHERE login = ?`, 
            [lat, lng, speed || 0, heading || 0, today, today, userLogin]
        );
    }

    const now = Date.now();
    if (userRole === 'admin') {
        let allUsers = {};
        Object.keys(activeUsers).forEach(id => {
            if (now - activeUsers[id].lastUpdate < 30000) allUsers[id] = activeUsers[id];
            else delete activeUsers[id];
        });
        res.json({ users: allUsers, signal: webrtcSignals[userLogin] || null });
        if (webrtcSignals[userLogin]) delete webrtcSignals[userLogin];
    } else {
        // Обновляем данные пользователя для бота
        if (!activeUsers[deviceId]) {
            activeUsers[deviceId] = { 
                name: userLogin, 
                startTime: Date.now(),
                lastUpdate: Date.now()
            };
        }
        activeUsers[deviceId].lat = lat;
        activeUsers[deviceId].lng = lng;
        activeUsers[deviceId].speed = speed || 0;
        activeUsers[deviceId].heading = heading;
        activeUsers[deviceId].lastUpdate = Date.now();
        activeUsers[deviceId].routePlan = req.body.routePlan || null;
        activeUsers[deviceId].actualTrack = req.body.actualTrack || null; // Сохраняем фактический путь
        if (!activeUsers[deviceId].startTime) activeUsers[deviceId].startTime = Date.now();

        res.json({ 
            command: activeUsers[deviceId]?.pendingCommand || null,
            signal: webrtcSignals[userLogin] || null 
        });
        if (activeUsers[deviceId]) activeUsers[deviceId].pendingCommand = null;
        if (webrtcSignals[userLogin]) delete webrtcSignals[userLogin];
    }
});

app.post('/api/admin/signal', authMiddleware, (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send('Forbidden');
    const { targetLogin, command } = req.body;
    const targetId = Object.keys(activeUsers).find(id => activeUsers[id].name === targetLogin);
    if (targetId) {
        activeUsers[targetId].pendingCommand = command;
        res.json({ success: true });
    } else res.json({ success: false, error: 'Оффлайн' });
});

app.post('/api/webrtc/signal', authMiddleware, (req, res) => {
    const { targetLogin, signal } = req.body;
    webrtcSignals[targetLogin] = signal;
    res.json({ success: true });
});

// --- ОСТАЛЬНЫЕ API ---
app.post('/api/admin/create-user', authMiddleware, async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { login, password } = req.body;
    try {
        await db.execute('INSERT INTO users (login, password, role) VALUES (?, ?, "user")', [login, password]);
        res.json({ success: true });
    } catch (err) { res.json({ error: 'User exists' }); }
});

app.get('/api/admin/users', authMiddleware, async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const [rows] = await db.execute('SELECT login, password, role, blocked, last_lat, last_lng, last_speed, last_seen, total_time_sec, today_time_sec FROM users WHERE role != "admin"');
    res.json(rows);
});

app.get('/api/admin/logs', authMiddleware, async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const [rows] = await db.execute('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 50');
    res.json(rows);
});

app.delete('/api/admin/users/:login', authMiddleware, async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    await db.execute('DELETE FROM users WHERE login = ?', [req.params.login]);
    res.json({ success: true });
});

app.post('/api/admin/users/toggle-block', authMiddleware, async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { login } = req.body;
    await db.execute('UPDATE users SET blocked = NOT blocked WHERE login = ?', [login]);
    res.json({ success: true });
});

app.get('/api/user/me', authMiddleware, (req, res) => res.json({ login: req.session.user, role: req.session.role }));

app.get('/api/tracks', authMiddleware, async (req, res) => {
    let query = 'SELECT * FROM tracks WHERE user_login = ?';
    let params = [req.session.user];
    if (req.session.role === 'admin') { query = 'SELECT * FROM tracks'; params = []; }
    const [rows] = await db.execute(query, params);
    res.json(rows.map(r => ({ ...r, points: JSON.parse(r.points) })));
});

app.post('/api/tracks', authMiddleware, async (req, res) => {
    const { id, name, start, end, points } = req.body;
    await db.execute('INSERT INTO tracks (id, user_login, name, start_time, end_time, points) VALUES (?, ?, ?, ?, ?, ?)', 
        [id, req.session.user, name, start, end, JSON.stringify(points)]);
    res.json({ success: true });
});

app.delete('/api/tracks/:id', authMiddleware, async (req, res) => {
    await db.execute('DELETE FROM tracks WHERE id = ? AND user_login = ?', [req.params.id, req.session.user]);
    res.json({ success: true });
});

app.get('/api/markers', authMiddleware, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM markers WHERE user_login = ?', [req.session.user]);
    res.json(rows);
});

app.post('/api/markers', authMiddleware, async (req, res) => {
    const { id, label, lat, lng, date } = req.body;
    await db.execute('INSERT INTO markers (id, user_login, label, lat, lng, date) VALUES (?, ?, ?, ?, ?, ?)', 
        [id, req.session.user, label, lat, lng, date]);
    res.json({ success: true });
});

app.delete('/api/markers/:id', authMiddleware, async (req, res) => {
    await db.execute('DELETE FROM markers WHERE id = ? AND user_login = ?', [req.params.id, req.session.user]);
    res.json({ success: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', authMiddleware, (req, res) => {
    if (req.session.role === 'admin') {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'user.html'));
    }
});

const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) fs.mkdirSync(sslDir);
const keyPath = path.join(sslDir, 'key.pem'), certPath = path.join(sslDir, 'cert.pem');
let sslOptions = {};
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    sslOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
} else {
    const pems = selfsigned.generate([{ name: 'commonName', value: 'astromap.local' }], { days: 365, keySize: 2048 });
    fs.writeFileSync(keyPath, pems.private); fs.writeFileSync(certPath, pems.cert);
    sslOptions = { key: pems.private, cert: pems.cert };
}

https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AstroMAP (HTTPS + MySQL) на https://localhost:${PORT}`);
    notifyServerStart();
});
