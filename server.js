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

const MAX_SLOTS = 2;
const sessions = new Map(); 

function createClient(clientId, telegramChatId = null, phoneNumber = null) {
    if (sessions.has(clientId)) return sessions.get(clientId);

    const sessionData = {
        client: null,
        isConnected: false,
        currentQR: null,
        statusText: 'Initializing...',
        pairingRequested: false
    };
    sessions.set(clientId, sessionData);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId }),
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
    sessionData.client = client;

    client.on('qr', async (qr) => {
        console.log(`[${clientId}] QR Code / Auth request received.`);
        
        if (phoneNumber && !sessionData.pairingRequested) {
            sessionData.pairingRequested = true;
            try {
                // Ensure number is digits only and has country code
                let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                if (cleanNumber.startsWith('0')) {
                    cleanNumber = '62' + cleanNumber.substring(1);
                }
                console.log(`[${clientId}] Requesting pairing code for ${cleanNumber}...`);
                const code = await client.requestPairingCode(cleanNumber);
                if (telegramChatId && bot) {
                    bot.sendMessage(telegramChatId, `🔗 *Kode Tautan Anda: ${code}*\n\nBuka WhatsApp > Tautkan Perangkat > Tautkan dengan nomor telepon > Masukkan kode di atas.`, { parse_mode: 'Markdown' });
                }
            } catch (error) {
                console.error(`[${clientId}] Error requesting pairing code:`, error);
                if (telegramChatId && bot) {
                    bot.sendMessage(telegramChatId, `❌ Gagal meminta kode tautan. Pastikan nomor HP benar (tanpa +) dan coba lagi.`);
                }
            }
            return;
        }

        try {
            sessionData.currentQR = await qrcode.toDataURL(qr);
            sessionData.isConnected = false;
            sessionData.statusText = 'Menunggu Scan QR';

            if (telegramChatId && bot && !phoneNumber) {
                const base64Data = sessionData.currentQR.replace(/^data:image\/png;base64,/, "");
                const imageBuffer = Buffer.from(base64Data, 'base64');
                bot.sendPhoto(telegramChatId, imageBuffer, { caption: 'Scan QR Code ini menggunakan WhatsApp Anda.' }).catch(e => console.error(e));
            }
        } catch (err) {
            console.error(`[${clientId}] Error generating QR code:`, err);
        }
    });

    client.on('ready', () => {
        console.log(`[${clientId}] WhatsApp Client is ready!`);
        sessionData.isConnected = true;
        sessionData.currentQR = null;
        sessionData.statusText = 'Terhubung';

        if (telegramChatId && bot) {
            bot.sendMessage(telegramChatId, '✅ WhatsApp berhasil terhubung! Anda sudah bisa memakai perintah /send.');
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`[${clientId}] WhatsApp Client was disconnected:`, reason);
        sessionData.isConnected = false;
        sessionData.statusText = 'Terputus';
        if (telegramChatId && bot) {
            bot.sendMessage(telegramChatId, '❌ WhatsApp Anda terputus. Silakan /login kembali.');
        }
        client.destroy();
        sessions.delete(clientId);
    });

    client.initialize();
    return sessionData;
}

function destroyClient(clientId) {
    if (sessions.has(clientId)) {
        const sessionData = sessions.get(clientId);
        if (sessionData.client) {
            sessionData.client.destroy();
        }
        sessions.delete(clientId);
    }
}

// Initialize Telegram Bot
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : null;
const SECURITY_CODE = process.env.SECURITY_CODE ? process.env.SECURITY_CODE.trim() : null;
const WEB_APP_URL = process.env.WEB_APP_URL ? process.env.WEB_APP_URL.trim() : null;
const ALLOWED_WEB_TOKENS = process.env.ALLOWED_WEB_TOKENS ? process.env.ALLOWED_WEB_TOKENS.split(',').map(t => t.trim()) : null;

let bot = null;
if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('Telegram Bot initialized.');

    async function processLoginRequest(chatId, clientId, code, phoneNumber) {
        if (SECURITY_CODE && code !== SECURITY_CODE) {
            return bot.sendMessage(chatId, '⛔ Kode keamanan salah atau tidak dimasukkan.\nCara penggunaan: `/login <kode_rahasia> [nomor_hp]`', { parse_mode: 'Markdown' });
        }

        if (sessions.has(clientId)) {
            return bot.sendMessage(chatId, '✅ Anda sudah memiliki sesi aktif. Ketik /status atau /logout.', {
                reply_markup: { remove_keyboard: true }
            });
        }

        if (sessions.size >= MAX_SLOTS) {
            return bot.sendMessage(chatId, '⛔ Maaf, semua slot saat ini sedang penuh. Silakan coba lagi nanti jika ada yang /logout.', {
                reply_markup: { remove_keyboard: true }
            });
        }

        bot.sendMessage(chatId, phoneNumber ? '⏳ Mengalokasikan slot... Mohon tunggu untuk mendapatkan Kode Tautan.' : '⏳ Mengalokasikan slot... Mohon tunggu untuk memunculkan QR Code.', {
            reply_markup: { remove_keyboard: true }
        });
        createClient(clientId, chatId, phoneNumber);
    }

    bot.onText(/\/(start|help)/, (msg) => {
        const chatId = msg.chat.id;
        const helpText = `*WhatsApp Sender Bot (Sistem Slot)*\n\n` +
            `/login <kode_rahasia> [nomor_hp] - Dapatkan QR / Kode Tautan\n` +
            `/status - Cek status WhatsApp Anda\n` +
            `/send <nomor> <pesan> - Kirim pesan WA\n` +
            `/logout - Logout dan melepaskan slot\n\n` +
            `Contoh scan QR: \`/login rahasia123\`\n` +
            `Contoh tanpa HP ke-2 (Kode): \`/login rahasia123 628123456789\`\n\n` +
            `Bot ini maksimal melayani ${MAX_SLOTS} orang bersamaan.`;
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/login(?:\s+([^\s]+))?(?:\s+([^\s]+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const clientId = chatId.toString();
        const code = match ? match[1] : null;
        const phoneNumber = match ? match[2] : null;

        if (!code) {
            if (!WEB_APP_URL) {
                return bot.sendMessage(chatId, '⚠️ Mode Pop-up belum dikonfigurasi (WEB_APP_URL kosong).\nSilakan gunakan mode manual:\n`/login <kode_rahasia> [nomor_hp]`', { parse_mode: 'Markdown' });
            }
            return bot.sendMessage(chatId, 'Klik tombol di bawah ini untuk membuka layar login:', {
                reply_markup: {
                    keyboard: [[{ text: '🔑 Buka Layar Login', web_app: { url: `${WEB_APP_URL}/telegram-login.html` } }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }

        await processLoginRequest(chatId, clientId, code, phoneNumber);
    });

    bot.on('message', async (msg) => {
        if (msg.web_app_data) {
            try {
                const data = JSON.parse(msg.web_app_data.data);
                if (data.type === 'LOGIN_REQUEST') {
                    const chatId = msg.chat.id;
                    const clientId = chatId.toString();
                    await processLoginRequest(chatId, clientId, data.code, data.phone || null);
                }
            } catch (err) {
                console.error('Error parsing web_app_data:', err);
            }
        }
    });

    bot.onText(/\/logout/, async (msg) => {
        const chatId = msg.chat.id;
        const clientId = chatId.toString();

        if (!sessions.has(clientId)) {
            return bot.sendMessage(chatId, 'Anda tidak memiliki sesi aktif.');
        }

        destroyClient(clientId);
        bot.sendMessage(chatId, '✅ Anda berhasil logout dan slot Anda telah dibebaskan.');
    });

    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const clientId = chatId.toString();

        if (!sessions.has(clientId)) {
            return bot.sendMessage(chatId, 'Anda belum mengambil slot. Ketik /login untuk mulai.');
        }

        const sessionData = sessions.get(clientId);
        bot.sendMessage(chatId, sessionData.isConnected ? '✅ WhatsApp Terhubung.' : `⏳ Status: ${sessionData.statusText}`);
    });

    bot.onText(/\/send\s+([\d,\s\+]+)\s+([\s\S]+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const clientId = chatId.toString();

        if (!sessions.has(clientId)) {
            return bot.sendMessage(chatId, 'Anda belum /login.');
        }

        const sessionData = sessions.get(clientId);
        if (!sessionData.isConnected) {
            return bot.sendMessage(chatId, '❌ WhatsApp Anda belum terhubung. Harap tunggu hingga terhubung.');
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

                await sessionData.client.sendMessage(formattedNumber, message);
                successCount++;
            } catch (error) {
                console.error(`Telegram send error to ${number}:`, error.message);
                failCount++;
            }
        }

        bot.sendMessage(chatId, `✅ *Selesai!*\nBerhasil: ${successCount}\nGagal: ${failCount}`, { parse_mode: 'Markdown' });
    });
}

function getWebClientId(req) {
    const token = req.headers['x-web-token'];
    if (!token) return { valid: false, error: 'Token required' };
    const trimmed = token.trim();
    
    if (ALLOWED_WEB_TOKENS && !ALLOWED_WEB_TOKENS.includes(trimmed)) {
        return { valid: false, error: 'Token tidak terdaftar. Akses ditolak.' };
    }
    return { valid: true, id: `web_${trimmed}` };
}

app.get('/status', (req, res) => {
    const auth = getWebClientId(req);
    if (!auth.valid) return res.status(401).json({ connected: false, error: auth.error });

    const sessionData = sessions.get(auth.id);
    res.json({
        connected: sessionData ? sessionData.isConnected : false
    });
});

app.get('/qr', (req, res) => {
    const auth = getWebClientId(req);
    if (!auth.valid) return res.status(401).json({ success: false, error: auth.error });
    const clientId = auth.id;

    let sessionData = sessions.get(clientId);
    if (!sessionData) {
        if (sessions.size >= MAX_SLOTS) {
            return res.json({ success: false, error: 'Maksimal slot (2 sesi) sudah penuh. Harap tunggu ada yang logout.' });
        }
        sessionData = createClient(clientId);
    }

    if (sessionData.isConnected) {
        return res.json({ success: false, error: 'Already connected' });
    }
    if (!sessionData.currentQR) {
        return res.json({ success: false, error: 'QR not ready yet' });
    }
    res.json({ success: true, qr: sessionData.currentQR });
});

app.post('/send-message', async (req, res) => {
    const auth = getWebClientId(req);
    if (!auth.valid) return res.status(401).json({ success: false, error: auth.error });
    const clientId = auth.id;

    const sessionData = sessions.get(clientId);
    if (!sessionData || !sessionData.isConnected) {
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
            let formattedNumber = number.replace(/[^0-9]/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.substring(1);
            }
            if (!formattedNumber.endsWith('@c.us')) {
                formattedNumber += '@c.us';
            }

            console.log(`[${clientId}] Sending message to ${formattedNumber}...`);
            await sessionData.client.sendMessage(formattedNumber, message);
            results.push({ number: number, formatted: formattedNumber, success: true });
        } catch (error) {
            console.error(`[${clientId}] Error sending to ${number}:`, error.message);
            results.push({ number: number, success: false, error: error.message });
        }
    }

    res.json({
        success: true,
        message: 'Proses pengiriman selesai',
        results
    });
});

app.post('/logout', (req, res) => {
    const auth = getWebClientId(req);
    if (!auth.valid) return res.status(401).json({ success: false, error: auth.error });
    const clientId = auth.id;

    if (sessions.has(clientId)) {
        destroyClient(clientId);
        return res.json({ success: true, message: 'Berhasil logout' });
    }
    return res.json({ success: true, message: 'Tidak ada sesi aktif' });
});

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
