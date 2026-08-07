import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import TelegramBot from 'node-telegram-bot-api';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let currentQR = null;
let isConnected = false;

// Initialize WhatsApp Client with LocalAuth
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Event: QR code received
client.on('qr', async (qr) => {
    console.log('QR Code received. Waiting for scan...');
    try {
        currentQR = await qrcode.toDataURL(qr);
        isConnected = false;
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

// Event: Client is ready (authenticated)
client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isConnected = true;
    currentQR = null;
});

// Event: Client disconnected
client.on('disconnected', (reason) => {
    console.log('WhatsApp Client was disconnected:', reason);
    isConnected = false;
    client.destroy();
    client.initialize();
});

// Start the client
client.initialize();

// Initialize Telegram Bot
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_TELEGRAM_ID = process.env.ALLOWED_TELEGRAM_ID;

let bot = null;
if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('Telegram Bot initialized.');

    bot.onText(/\/(start|help)/, (msg) => {
        const chatId = msg.chat.id;
        if (ALLOWED_TELEGRAM_ID && chatId.toString() !== ALLOWED_TELEGRAM_ID) {
            return bot.sendMessage(chatId, '⛔ Anda tidak diizinkan menggunakan bot ini.');
        }
        const helpText = `*WhatsApp Sender Bot*\n\n` +
            `/status - Cek status WhatsApp\n` +
            `/qr - Dapatkan QR Code login\n` +
            `/send <nomor> <pesan> - Kirim pesan WA\n` +
            `Contoh: /send 0812345678,0898765432 Halo ini pesan test!`;
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        if (ALLOWED_TELEGRAM_ID && chatId.toString() !== ALLOWED_TELEGRAM_ID) return;
        
        bot.sendMessage(chatId, isConnected ? '✅ WhatsApp Terhubung.' : '❌ WhatsApp Terputus. Ketik /qr untuk login.');
    });

    bot.onText(/\/qr/, async (msg) => {
        const chatId = msg.chat.id;
        if (ALLOWED_TELEGRAM_ID && chatId.toString() !== ALLOWED_TELEGRAM_ID) return;

        if (isConnected) {
            return bot.sendMessage(chatId, '✅ WhatsApp sudah terhubung, tidak perlu scan QR.');
        }
        if (!currentQR) {
            return bot.sendMessage(chatId, '⏳ QR Code belum siap, silakan tunggu sebentar dan coba lagi.');
        }

        try {
            const base64Data = currentQR.replace(/^data:image\/png;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, 'base64');
            bot.sendPhoto(chatId, imageBuffer, { caption: 'Scan QR Code ini menggunakan WhatsApp Anda.' });
        } catch (error) {
            console.error('Error sending QR via Telegram:', error);
            bot.sendMessage(chatId, 'Gagal mengirim QR Code.');
        }
    });

    bot.onText(/\/send\s+([\d,\s\+]+)\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (ALLOWED_TELEGRAM_ID && chatId.toString() !== ALLOWED_TELEGRAM_ID) return;

        if (!isConnected) {
            return bot.sendMessage(chatId, '❌ WhatsApp belum terhubung. Ketik /qr untuk login.');
        }

        const toMatch = match[1];
        const message = match[2];

        const recipients = toMatch.split(/[\s,]+/).map(n => n.trim()).filter(n => n);
        if (recipients.length === 0) {
            return bot.sendMessage(chatId, 'Format nomor tidak valid.');
        }

        bot.sendMessage(chatId, `⏳ Sedang memproses pengiriman ke ${recipients.length} nomor...`);

        let successCount = 0;
        let failCount = 0;

        for (let number of recipients) {
            try {
                let formattedNumber = number.replace(/[^0-9]/g, '');
                if (formattedNumber.startsWith('0')) {
                    formattedNumber = '62' + formattedNumber.substring(1);
                }
                if (!formattedNumber.endsWith('@c.us')) {
                    formattedNumber += '@c.us';
                }

                await client.sendMessage(formattedNumber, message);
                successCount++;
            } catch (error) {
                console.error(`Telegram send error to ${number}:`, error.message);
                failCount++;
            }
        }

        bot.sendMessage(chatId, `✅ *Selesai!*\nBerhasil: ${successCount}\nGagal: ${failCount}`, { parse_mode: 'Markdown' });
    });
}

// API Endpoints

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected
    });
});

app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.json({ success: false, error: 'Already connected' });
    }
    if (!currentQR) {
        return res.json({ success: false, error: 'QR not ready yet' });
    }
    res.json({ success: true, qr: currentQR });
});

app.post('/send-message', async (req, res) => {
    if (!isConnected) {
        return res.status(403).json({ success: false, error: 'WhatsApp client is not connected' });
    }

    const { to, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ success: false, error: 'Nomor tujuan (to) dan pesan (message) diperlukan.' });
    }

    const recipients = Array.isArray(to)
        ? to
        : to.split(/[\s,]+/).map(n => n.trim()).filter(n => n);

    if (recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Nomor tujuan tidak valid.' });
    }

    const results = [];

    for (let number of recipients) {
        try {
            let formattedNumber = number;
            formattedNumber = formattedNumber.replace(/[^0-9]/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.substring(1);
            }
            if (!formattedNumber.endsWith('@c.us')) {
                formattedNumber += '@c.us';
            }

            console.log(`Sending message to ${formattedNumber}...`);
            await client.sendMessage(formattedNumber, message);
            
            console.log(`Success sending to ${formattedNumber}`);
            results.push({ number: number, formatted: formattedNumber, success: true });
        } catch (error) {
            console.error(`Error sending to ${number}:`, error.message);
            results.push({ number: number, success: false, error: error.message });
        }
    }

    res.json({
        success: true,
        message: 'Proses pengiriman selesai',
        results
    });
});

// Serve Frontend Static Files
// Karena semua sekarang di root, React build folder-nya ada di ./dist
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
