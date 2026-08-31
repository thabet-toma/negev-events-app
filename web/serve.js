'use strict';

/*
 * خادم ملفات ثابتة للتطوير المحلي فقط — بدون أي اعتماديات.
 *
 * الواجهة صارت وحدة نشر مستقلة عن الخادم، فتحتاج من يخدمها محلياً.
 * في الإنتاج تُخدم عبر nginx أو أي استضافة ثابتة (انظر docker-compose.yml).
 *
 *   node serve.js            → http://localhost:8080
 *   PORT=5173 node serve.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relative);

  // Never serve anything outside this folder.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('الصفحة غير موجودة');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  });
});

server.listen(PORT, () => {
  const apiBase = (fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').match(/apiBase:\s*'([^']*)'/) || [])[1];
  console.log('====================================================');
  console.log('🖥️  واجهة الويب — منصة مناسبات النقب');
  console.log(`📱 الموقع:      http://localhost:${PORT}`);
  console.log(`👑 لوحة التحكم: http://localhost:${PORT}/admin.html`);
  console.log(`🔌 الخادم:      ${apiBase}   (عدّله في config.js)`);
  console.log('====================================================');
});
