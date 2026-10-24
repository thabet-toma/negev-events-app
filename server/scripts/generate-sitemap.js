'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../src/db/pool');
const config = require('../src/config');
const { ABOUT_LASTMOD } = require('../src/constants');
const events = require('../src/services/events.service');

async function main() {
  const sitemapEvents = await events.listSitemapEvents();
  const siteUrl = config.publicUrl.replace(/\/+$/, '');
  const urls = [
    `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${ABOUT_LASTMOD}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/about.html</loc>\n    <lastmod>${ABOUT_LASTMOD}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/live</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/privacy.html</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.3</priority>\n  </url>`
  ];

  for (const evt of sitemapEvents) {
    urls.push(`  <url>\n    <loc>${siteUrl}/e/${evt.id}</loc>\n    <lastmod>${evt.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  const destPath = path.resolve(__dirname, '../../web/sitemap.xml');
  fs.writeFileSync(destPath, xml, 'utf8');
  console.log(`Generated sitemap with ${sitemapEvents.length} events -> ${destPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error generating sitemap:', err);
  process.exit(1);
});
