const TelegramBot = require('node-telegram-bot-api');

// Токен вашего бота
const token = '8755396144:AAHEzWlLG2930bNvNbaTnERfXYUaeZ4GR3k';

// Создаем экземпляр бота
const bot = new TelegramBot(token, { polling: true });

// Функция для уведомления о запуске сервера
function notifyServerStart() {
    // Здесь можно указать ваш Chat ID, если он известен. 
    // Если нет, бот напишет вам, когда вы отправите ему /start
    console.log('Telegram Bot: Система уведомлений запущена');
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🚀 Система AstroMAP приветствует вас!\n\nВаш Chat ID: ${chatId}\nИспользуйте /status для проверки сервера.`);
});

// Обработка команды /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    bot.sendMessage(chatId, `✅ Сервер AstroMAP работает штатно.\n⏱ Время работы: ${hours}ч ${minutes}м\n🌐 Доступ: https://localhost:3000`);
});

// Обработка команды /users
bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    
    const activeUsers = global.activeUsers || {};
    const userKeys = Object.keys(activeUsers);

    if (userKeys.length === 0) {
        return bot.sendMessage(chatId, "📭 В сети пока никого нет.");
    }

    let report = "👥 *Список пользователей:* \n\n";

    userKeys.forEach(id => {
        const u = activeUsers[id];
        const lastSeen = new Date(u.lastUpdate).toLocaleTimeString();
        const speed = u.speed || 0;
        const status = speed > 2 ? "🚀 В дороге" : "📍 Прибыл/Стоит";
        const coords = u.lat ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : "Нет данных";
        
        // Исправленный расчет времени
        const now = Date.now();
        const start = u.startTime || now;
        const diffMs = now - start;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);

        report += `👤 *${u.name}*\n`;
        report += `📡 GPS: \`${coords}\`\n`;
        report += `🕒 В сети: ${lastSeen}\n`;
        report += `⏱ В пути: ${hours}ч ${mins}м\n`;
        report += `📊 Статус: ${status} (${Math.round(speed)} км/ч)\n`;
        report += `────────────────────\n`;
    });

    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Доступные команды:\n/status - Состояние сервера\n/users - Список пользователей и их GPS\n/help - Список команд");
});

module.exports = { bot,