const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ALLOWED_DOMAINS = [
    'roblox.com',
    'rbxcdn.com',
    'catalog.roblox.com',
    'inventory.roblox.com',
    'games.roblox.com',
    'apis.roblox.com',
    'thumbnails.roblox.com',
    'economy.roblox.com',
    'avatar.roblox.com'
];

function isAllowedDomain(url) {
    try {
        const urlObj = new URL(url);
        return ALLOWED_DOMAINS.some(domain => urlObj.hostname.includes(domain));
    } catch {
        return false;
    }
}

// ================== KONFIG FITUR GIFT GAMEPASS ==================
const API_SECRET = process.env.API_SECRET; // opsional, proteksi endpoint
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // opsional

// Middleware proteksi sederhana pakai header x-api-secret (kalau di-set)
function requireSecret(req, res, next) {
    if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Helper: username -> { valid, userId, username }
async function lookupUsername(username) {
    const response = await axios.post(
        'https://users.roblox.com/v1/usernames/users',
        { usernames: [username], excludeBannedUsers: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const data = response.data;
    if (data && Array.isArray(data.data) && data.data.length > 0) {
        const user = data.data[0];
        return { valid: true, userId: user.id, username: user.name };
    }
    return { valid: false };
}

// ================== VERIFY USERNAME ==================
// GET /verify-username?username=NamaUser
app.get('/verify-username', requireSecret, async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ valid: false, error: 'Username diperlukan' });
    }

    try {
        const result = await lookupUsername(username);
        return res.status(200).json(result);
    } catch (error) {
        console.error('verify-username error:', error.message);
        return res.status(500).json({ valid: false, error: 'Internal error' });
    }
});

// ================== GAMEPASSES FOR USER ==================
// GET /gamepasses-for-user?username=NamaUser
// Ambil SEMUA gamepass yang ada di inventory/koleksi target user itu,
// langsung dari inventory.roblox.com -- tanpa perlu cari game satu-satu.
// Detail nama/harga tiap gamepass BELUM diisi di sini; itu diambil di sisi
// Roblox (server script) pakai MarketplaceService:GetProductInfo, biar
// lebih ringan & gak perlu request HTTP tambahan per item dari backend.
app.get('/gamepasses-for-user', requireSecret, async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ valid: false, error: 'Username diperlukan' });
    }

    try {
        const userLookup = await lookupUsername(username);
        if (!userLookup.valid) {
            return res.status(200).json({ valid: false });
        }
        const { userId } = userLookup;

        // Pagination lama Roblox (pageNumber), berhenti kalau halaman kosong / error
        let gamepassIds = [];
        let pageNumber = 1;
        const MAX_PAGES = 10; // safety cap (~500 item kalau 50/halaman)
        let debugInfo = null;

        while (pageNumber <= MAX_PAGES) {
            const url = `https://inventory.roblox.com/v1/users/${userId}/items/GamePass?pageNumber=${pageNumber}`;
            let data;
            try {
                const invRes = await axios.get(url, { timeout: 15000 });
                data = invRes.data;
                if (pageNumber === 1) {
                    debugInfo = { page1Status: invRes.status, page1RawSample: JSON.stringify(data).slice(0, 500) };
                }
            } catch (e) {
                console.error(`gamepasses-for-user: gagal ambil halaman ${pageNumber}:`, e.message);
                if (pageNumber === 1) {
                    debugInfo = {
                        page1Error: e.message,
                        page1Status: e.response ? e.response.status : null,
                        page1Body: e.response ? JSON.stringify(e.response.data).slice(0, 500) : null,
                    };
                }
                break;
            }

            if (!data || !Array.isArray(data.data) || data.data.length === 0) {
                break;
            }

            for (const item of data.data) {
                if (item && item.id && !gamepassIds.includes(item.id)) {
                    gamepassIds.push(item.id);
                }
            }

            pageNumber += 1;
        }

        return res.status(200).json({
            valid: true,
            userId,
            username: userLookup.username,
            gamepassIds,
            debug: debugInfo,
        });
    } catch (error) {
        console.error('gamepasses-for-user error:', error.message);
        return res.status(500).json({ valid: false, error: 'Internal error' });
    }
});

// ================== GIFT REQUEST ==================
// POST /gift  body: { fromUserId, fromUsername, toUsername, gamepassId, gamepassName, price }
// Roblox tidak mengizinkan pemberian gamepass langsung ke user lain lewat
// API pihak ketiga, jadi endpoint ini hanya MENCATAT/MENOTIFIKASI request-nya.
app.post('/gift', requireSecret, async (req, res) => {
    const { fromUserId, fromUsername, toUsername, gamepassId, gamepassName, price } = req.body || {};

    if (!toUsername || !gamepassId) {
        return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
    }

    console.log('[GIFT REQUEST]', {
        fromUserId, fromUsername, toUsername, gamepassId, gamepassName, price,
        time: new Date().toISOString(),
    });

    if (DISCORD_WEBHOOK_URL) {
        try {
            await axios.post(DISCORD_WEBHOOK_URL, {
                content:
                    `🎁 **Gift Request Baru**\n` +
                    `Dari: ${fromUsername} (${fromUserId})\n` +
                    `Untuk: ${toUsername}\n` +
                    `Gamepass: ${gamepassName} (ID: ${gamepassId})\n` +
                    `Harga: R$ ${price}`,
            });
        } catch (err) {
            console.error('Gagal kirim webhook Discord:', err.message);
        }
    }

    return res.status(200).json({ success: true });
});

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    const decodedUrl = decodeURIComponent(targetUrl);

    if (!isAllowedDomain(decodedUrl)) {
        return res.status(403).json({ error: 'Domain not allowed' });
    }

    try {
        const response = await axios.get(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 30000,
            maxRedirects: 5
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('Proxy error:', error.message);
        
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Proxy request failed' });
        }
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Proxy server is running' });
});

app.get('/', (req, res) => {
    res.json({
        message: 'Roblox Proxy Server',
        usage: {
            proxy: '/proxy?url=YOUR_ROBLOX_URL',
            verifyUsername: '/verify-username?username=NamaUser',
            gamepassesForUser: '/gamepasses-for-user?username=NamaUser',
            gift: 'POST /gift { fromUserId, fromUsername, toUsername, gamepassId, gamepassName, price }',
        },
        health: '/health'
    });
});

app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});

module.exports = app;
