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
// Ambil SEMUA gamepass yang dijual dari game-game bikinan target user itu
// sendiri -- otomatis, tanpa perlu UNIVERSE_ID manual.
//
// Alur: username -> userId -> semua game publik milik userId -> semua
// gamepass dari tiap game itu -> digabung jadi satu list.
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

        // 1) Ambil semua game publik milik user ini (dengan pagination, dibatasi biar gak kelamaan)
        let allGames = [];
        let gameCursor = '';
        let gameSafety = 0;

        do {
            const url = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=50&sortOrder=Asc${gameCursor ? `&cursor=${gameCursor}` : ''}`;
            const gameRes = await axios.get(url, { timeout: 15000 });
            const gameData = gameRes.data;

            if (gameData && Array.isArray(gameData.data)) {
                allGames = allGames.concat(gameData.data);
            }
            gameCursor = gameData && gameData.nextPageCursor ? gameData.nextPageCursor : '';
            gameSafety += 1;
        } while (gameCursor && gameSafety < 5); // maksimal ~250 game

        // 2) Ambil semua gamepass dari tiap game tsb (paralel)
        const gamepassesPerGame = await Promise.all(
            allGames.map(async (game) => {
                try {
                    const passRes = await axios.get(
                        `https://games.roblox.com/v1/games/${game.id}/game-passes?limit=100&sortOrder=Asc`,
                        { timeout: 15000 }
                    );
                    const passData = passRes.data;
                    if (!passData || !Array.isArray(passData.data)) return [];

                    return passData.data.map((gp) => ({
                        id: gp.id,
                        name: gp.displayName || gp.name,
                        price: gp.price === null || gp.price === undefined ? 0 : gp.price,
                        gameName: game.name,
                        universeId: game.id,
                    }));
                } catch (e) {
                    return [];
                }
            })
        );

        const allPasses = gamepassesPerGame.flat();

        return res.status(200).json({
            valid: true,
            userId,
            username: userLookup.username,
            gamepasses: allPasses,
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
