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
        usage: '/proxy?url=YOUR_ROBLOX_URL',
        health: '/health'
    });
});

app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});

module.exports = app;