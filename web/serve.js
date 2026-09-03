'use strict';

/*
 * خادم التطوير المحلي للواجهة — بدون أي اعتماديات.
 *
 * يخدم ملفات هذا المجلد، **ويمرّر** مسارات الخادم (`/api`، `/uploads`،
 * `/downloads`، `/socket.io`) إلى الخادم الحقيقي. بذلك تعمل الواجهة محلياً
 * من أصل واحد تماماً كما تعمل في الإنتاج خلف nginx، فلا يحتاج
 * `config.js` قيمة مختلفة بين البيئتين.
 *
 * في الإنتاج يقوم nginx بهذا الدور — هذا الملف للتطوير فقط.
 *
 *   node serve.js
 *   PORT=5173 API_ORIGIN=http://localhost:3000 node serve.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

// المسارات التي يملكها الخادم؛ كل ما عداها ملفات ثابتة.
const PROXIED = ['/api', '/uploads', '/downloads', '/socket.io', '/e'];

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

/**
 * يطابق البادئة على حدود المسار فقط: `/api/events` يمر، و`/api.js` لا.
 * هذا بالضبط ما يجب أن يفعله nginx (`^~ /api/` وليس `/api`).
 */
function isProxied(urlPath) {
  return PROXIED.some(
    prefix => urlPath === prefix || urlPath.startsWith(`${prefix}/`)
  );
}

function proxy(req, res) {
  const target = new URL(API_ORIGIN);
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host }
    },
    upstreamRes => {
      // خطأ أثناء تدفّق الرد (كأن يسقط الخادم في منتصفه).
      upstreamRes.on('error', () => res.destroy());
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        success: false,
        message: `تعذّر الوصول إلى الخادم على ${API_ORIGIN} — تأكد أنه يعمل`
      })
    );
  });

  // بدون هذين، أي ECONNRESET — وإعادة تشغيل الخادم تسبّبه — يرمي استثناءً
  // غير ملتقَط فيُسقط خادم التطوير بأكمله.
  req.on('error', () => upstream.destroy());
  res.on('error', () => upstream.destroy());

  req.pipe(upstream);
}

function serveStatic(req, res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relative);

  // لا نخدم أي شيء خارج هذا المجلد.
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
    res.writeHead(200, {
      'Content-Type':
        MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (isProxied(urlPath)) {
    proxy(req, res);
    return;
  }
  serveStatic(req, res, urlPath);
});

// ترقية WebSocket لـSocket.IO.
server.on('upgrade', (req, socket, head) => {
  const target = new URL(API_ORIGIN);
  const upstream = http.request({
    hostname: target.hostname,
    port: target.port || 80,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers, host: target.host }
  });

  // مقبس WebSocket مفتوح طويلاً، وسقوط الخادم يقطعه بـECONNRESET. بدون معالج
  // هنا يخرج الاستثناء غير ملتقَط فيُسقط خادم التطوير — وإعادة تشغيل الخادم
  // أثناء العمل تفعل ذلك في كل مرة.
  socket.on('error', () => socket.destroy());

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    upstreamSocket.on('error', () => {
      upstreamSocket.destroy();
      socket.destroy();
    });

    const headers = Object.entries(upstreamRes.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
    if (upstreamHead && upstreamHead.length) socket.unshift(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstream.on('error', () => socket.destroy());
  if (head && head.length) upstream.write(head);
  upstream.end();
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log('🖥️  واجهة الويب — منصة مناسبات النقب');
  console.log(`📱 الموقع:      http://localhost:${PORT}`);
  console.log(`👑 لوحة التحكم: http://localhost:${PORT}/admin.html`);
  console.log(`🔌 يمرّر ${PROXIED.join(' ')} إلى ${API_ORIGIN}`);
  console.log('====================================================');
});
