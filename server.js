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
                // Ensure number is digits only
                const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
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

let bot = null;
if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('Telegram Bot initialized.');

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

        if (SECURITY_CODE && code !== SECURITY_CODE) {
            return bot.sendMessage(chatId, '⛔ Kode keamanan salah atau tidak dimasukkan.\nCara penggunaan: `/login <kode_rahasia> [nomor_hp]`', { parse_mode: 'Markdown' });
        }

        if (sessions.has(clientId)) {
            return bot.sendMessage(chatId, '✅ Anda sudah memiliki sesi aktif. Ketik /status atau /logout.');
        }

        if (sessions.size >= MAX_SLOTS) {
            return bot.sendMessage(chatId, '⛔ Maaf, semua slot saat ini sedang penuh. Silakan coba lagi nanti jika ada yang /logout.');
        }

        bot.sendMessage(chatId, phoneNumber ? '⏳ Mengalokasikan slot... Mohon tunggu untuk mendapatkan Kode Tautan.' : '⏳ Mengalokasikan slot... Mohon tunggu untuk memunculkan QR Code.');
        createClient(clientId, chatId, phoneNumber);
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

    bot.onText(/\/send\s+([\d,\s\+]+)\s+(.+)/, async (msg, match) => {
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

// API Endpoints for Web UI (uses 'web' slot, bypassing MAX_SLOTS to keep it working)

app.get('/status', (req, res) => {
    const sessionData = sessions.get('web');
    res.json({
        connected: sessionData ? sessionData.isConnected : false
    });
});

app.get('/qr', (req, res) => {
    let sessionData = sessions.get('web');
    if (!sessionData) {
        // Create Web session on demand (we don't count it against telegram slots to avoid breaking UI)
        sessionData = createClient('web');
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
    const sessionData = sessions.get('web');
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

            console.log(`[web] Sending message to ${formattedNumber}...`);
            await sessionData.client.sendMessage(formattedNumber, message);
            results.push({ number: number, formatted: formattedNumber, success: true });
        } catch (error) {
            console.error(`[web] Error sending to ${number}:`, error.message);
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
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
