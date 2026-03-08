/* ═══════════════════════════════════════════════════
   SnapVideo — Local HTTP Server
   No sudo or certificates required.
   
   Chrome treats http://localhost as a Secure Context,
   allowing PWA installation and File Handling API.
   
   Usage:
     1. node serve.js
     2. Open http://localhost:8090
   ═══════════════════════════════════════════════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8090;
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                const indexPath = path.join(ROOT, 'index.html');
                fs.createReadStream(indexPath).pipe(
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                );
                return;
            }
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        if (req.headers.range && (ext === '.mp4' || ext === '.mov' || ext === '.webm')) {
            const range = req.headers.range;
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': mimeType
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }

        res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n  🎬  SnapVideo Server Running (No Sudo Required)\n`);
    console.log(`     http://localhost:${PORT}\n`);
    console.log(`  To install as PWA:`);
    console.log(`  1. Open the URL above in Chrome`);
    console.log(`  2. Click the ⊕ (Install) icon in the address bar\n`);
});
