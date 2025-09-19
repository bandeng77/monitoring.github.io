// api/exchange-code.js
const { OAuth2Client } = require('google-auth-library');

// --- Konfigurasi Google OAuth2 ---
// Variabel lingkungan ini HARUS diatur di Vercel Environment Variables.
// Jika tidak diatur, akan menggunakan fallback domain Vercel Anda.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://monitoring-github-io-rho.vercel.app';

// Inisialisasi OAuth2Client
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

module.exports = async (req, res) => {
    // --- Konfigurasi CORS ---
    // Mengizinkan permintaan dari domain Vercel Anda.
    res.setHeader('Access-Control-Allow-Origin', 'https://monitoring-github-io-rho.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Tangani permintaan OPTIONS (preflight request untuk CORS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Pastikan hanya metode POST yang diizinkan
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { code, redirectUri } = req.body; // Menerima authorization code dari frontend

    // Validasi apakah code diterima
    if (!code) {
        return res.status(400).json({ message: 'Authorization code is missing in the request body.' });
    }

    try {
        // Set redirect URI untuk pertukaran kode ini.
        // Penting: Ini harus sama persis dengan yang digunakan saat meminta kode.
        oauth2Client.redirectUri = redirectUri;

        // --- Pertukaran Kode dengan Token ---
        const { tokens } = await oauth2Client.getToken(code);

        console.log('Successfully exchanged authorization code for tokens.');
        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token); // INI YANG PALING PENTING!

        // PENTING: Dalam aplikasi produksi multi-pengguna, Anda HARUS menyimpan `tokens.refresh_token`
        // ini di database yang aman, terkait dengan ID pengguna aplikasi Anda.
        // `access_token` akan kedaluwarsa, tetapi `refresh_token` dapat digunakan untuk mendapatkan
        // `access_token` baru tanpa interaksi pengguna.

        // Untuk DEMO ini, Anda akan menyalin `refresh_token` dari log Vercel
        // dan menempelkannya secara manual ke Vercel Environment Variable `GOOGLE_REFRESH_TOKEN`.
        // Ini hanya berlaku untuk satu pengguna/admin.

        res.status(200).json({
            message: 'Tokens exchanged successfully!',
            // Untuk keamanan, JANGAN kembalikan access_token atau refresh_token ke frontend di produksi.
            // Backend yang harus mengelola dan menggunakan token ini.
        });

    } catch (error) {
        console.error('Error exchanging authorization code:', error.message);
        res.status(500).json({ message: 'Failed to exchange authorization code.', error: error.message });
    }
};
