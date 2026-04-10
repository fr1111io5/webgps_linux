const express = require('express');
const session = require('express-session');
const path = require('path');
const https = require('https');
const fs = require('fs');
const selfsigned = require('selfsigned');

const app = express();
const PORT = 3000;

// Настройки авторизации
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin'; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка сессий
app.use(session({
    secret: 'astromap-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true } // Обязательно true для HTTPS
}));

// Проверка авторизации
const authMiddleware = (req, res, next) => {
    if (req.session.authorized) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Роут для входа
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { login, password } = req.body;
    if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
        req.session.authorized = true;
        res.redirect('/');
    } else {
        res.send('Неверный логин или пароль. <a href="/login">Попробовать снова</a>');
    }
});

// Защищаем основной сайт и скрипты
app.get('/', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/script.js', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

app.use(express.static(path.join(__dirname, 'public')));

// --- НАСТРОЙКА HTTPS И СЕРТИФИКАТОВ ---
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) fs.mkdirSync(sslDir);

const keyPath = path.join(sslDir, 'key.pem');
const certPath = path.join(sslDir, 'cert.pem');

let sslOptions = {};

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
    console.log('✅ Использование существующих SSL сертификатов из папки /ssl');
} else {
    console.log('🛠️ Генерирую новые SSL сертификаты (2048 bit)...');
    const attrs = [{ name: 'commonName', value: 'astromap.local' }];
    const pems = selfsigned.generate(attrs, { 
        days: 365,
        keySize: 2048 // Явно указываем размер ключа
    });
    
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    
    sslOptions = {
        key: pems.private,
        cert: pems.cert
    };
    console.log('✅ Новые сертификаты созданы и сохранены в папку /ssl');
}

https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AstroMAP защищен (HTTPS) на https://localhost:${PORT}`);
    console.log(`Логин: ${ADMIN_LOGIN} | Пароль: ${ADMIN_PASSWORD}`);
});
