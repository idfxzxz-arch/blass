import express from 'express';
import cors from 'cors';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7860;

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
