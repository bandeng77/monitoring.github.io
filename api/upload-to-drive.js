// api/upload-to-drive.js
const { google } = require('googleapis');
const { Readable } = require('stream');
const Busboy = require('busboy'); // Untuk parsing multipart/form-data
const { OAuth2Client } = require('google-auth-library');

// --- Konfigurasi Google OAuth2 ---
// Variabel lingkungan ini HARUS diatur di Vercel Environment Variables.
// Jika tidak diatur, akan menggunakan fallback domain Vercel Anda.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://monitoring-github-io-rho.vercel.app';

// Inisialisasi OAuth2Client
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// PENTING: Untuk DEMO/satu pengguna, refresh_token disimpan di variabel lingkungan.
// Untuk PRODUKSI multi-pengguna, refresh_token HARUS disimpan di database
// yang terkait dengan pengguna yang terotentikasi di aplikasi Anda.
let storedRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

// Fungsi untuk mendapatkan access token yang valid
async function getValidAccessToken() {
    if (!storedRefreshToken) {
        // Jika tidak ada refresh token, berarti pengguna belum pernah otorisasi
        // atau refresh token belum disimpan di Vercel Environment Variables.
        throw new Error('No refresh token found. User needs to authorize first or refresh token is missing in Vercel Environment Variables.');
    }

    oauth2Client.setCredentials({
        refresh_token: storedRefreshToken,
    });

    try {
        // Mencoba me-refresh access token. Jika berhasil, credentials akan diperbarui.
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials); // Perbarui credentials di client
        console.log('Access token refreshed successfully.');
        return credentials.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error.message);
        // Jika refresh token gagal, mungkin sudah tidak valid atau dicabut.
        throw new Error('Failed to refresh access token. User might need to re-authorize or refresh token is invalid.');
    }
}

module.exports = async (req, res) => {
    // --- Konfigurasi CORS ---
    // Mengizinkan permintaan dari domain Vercel Anda.
    // Jika Anda memiliki domain kustom, tambahkan juga di sini atau gunakan wildcard '*' untuk pengembangan (tidak disarankan untuk produksi).
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

    // --- Verifikasi Otorisasi Google Drive ---
    try {
        await getValidAccessToken(); // Coba dapatkan access token yang valid
    } catch (error) {
        console.error('Authorization check failed for upload:', error.message);
        // Mengembalikan status 401 jika otorisasi diperlukan
        return res.status(401).json({ message: 'Google Drive authorization required.', error: error.message });
    }

    // --- Parsing Multipart/Form-Data dengan Busboy ---
    const busboy = Busboy({ headers: req.headers });
    let fileData = null;
    let fileName = '';
    let folderId = '';

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if (fieldname === 'pdfFile') { // Nama field input file dari frontend
            fileName = filename.filename; // Nama asli file
            fileData = [];
            file.on('data', data => fileData.push(data));
            file.on('end', () => {
                fileData = Buffer.concat(fileData); // Gabungkan semua chunk data file
            });
        }
    });

    busboy.on('field', (fieldname, val) => {
        if (fieldname === 'fileName') { // Nama field untuk nama file yang diinginkan
            fileName = val;
        } else if (fieldname === 'folderId') { // Nama field untuk ID folder Google Drive
            folderId = val;
        }
    });

    busboy.on('finish', async () => {
        // Validasi data yang diterima
        if (!fileData || !fileName || !folderId) {
            return res.status(400).json({ message: 'Missing file, fileName, or folderId in the request.' });
        }

        try {
            // --- Unggah File ke Google Drive ---
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            const fileMetadata = {
                name: fileName,
                parents: [folderId], // Masukkan file ke dalam folder ini
            };

            const media = {
                mimeType: 'application/pdf', // Sesuaikan jika Anda mengunggah tipe file lain (misalnya 'image/jpeg')
                body: Readable.from(fileData), // Menggunakan Readable stream dari Buffer
            };

            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id,webViewLink', // Minta ID dan tautan tampilan web dari file yang diunggah
            });

            res.status(200).json({
                message: 'File uploaded successfully!',
                fileId: response.data.id,
                webViewLink: response.data.webViewLink,
            });
        } catch (error) {
            console.error('Error uploading file to Google Drive:', error.message);
            res.status(500).json({ message: 'Failed to upload file to Google Drive.', error: error.message });
        }
    });

    // Pipe the request stream ke Busboy untuk parsing
    req.pipe(busboy);
};
