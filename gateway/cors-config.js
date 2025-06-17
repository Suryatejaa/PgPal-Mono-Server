// gateway/cors-config.js
const ALLOWED_ORIGINS = [
    // Local development
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:4000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:4000',

    // WebSocket
    'ws://localhost:4011',
    'ws://127.0.0.1:4011',

    // HTTPS Production origins
    'https://purple-pgs.space',
    'https://www.purple-pgs.space',
    'https://api.purple-pgs.space',
    'https://owner.purple-pgs.space',
    'https://tenant.purple-pgs.space',
    'https://admin.purple-pgs.space',

    // HTTP versions (for testing/fallback)
    'http://purple-pgs.space',
    'http://www.purple-pgs.space',
    'http://api.purple-pgs.space',
    'http://owner.purple-pgs.space',
    'http://tenant.purple-pgs.space',
    'http://admin.purple-pgs.space',

    // Environment variables
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL
].filter(Boolean);

module.exports = { ALLOWED_ORIGINS };