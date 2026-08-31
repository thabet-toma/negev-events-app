'use strict';

/**
 * Step 1 of the daily munasabatna sync.
 *
 * Fetches https://munasabatna.com/weddings/, pulls every invitation poster URL
 * out of the raw HTML (no browser needed — the URLs are server-rendered), and
 * prints the ones that are NOT already in events.poster_url.
 *
 *   node scripts/munasabatna-scan.js            # JSON to stdout
 *   node scripts/munasabatna-scan.js --download # also saves them to /tmp
 *
 * The gate is "poster_url not already in the database", not a time window.
 * That is deliberate: if a run is skipped, fails, or the cron host is down,
 * the next run still picks up everything that was missed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/db/pool');

const PAGE = 'https://munasabatna.com/weddings/';
const POSTER_RE =
  /https:\/\/munasabatna\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s\\]*?nvitation[^"'\s\\]*?\.(?:jpe?g|png)/gi;

async function fetchPosterUrls() {
  const res = await fetch(PAGE, {
    headers: { 'User-Agent': 'negev-events-sync/1.0' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`${PAGE} returned HTTP ${res.status}`);

  const html = await res.text();
  return [...new Set(html.match(POSTER_RE) || [])];
}

async function run() {
  const download = process.argv.includes('--download');

  const onPage = await fetchPosterUrls();
  const rows = await db.query('SELECT poster_url FROM events WHERE poster_url IS NOT NULL');
  const known = new Set(rows.map(r => r.poster_url));
  const fresh = onPage.filter(url => !known.has(url));

  let dir = null;
  if (download && fresh.length) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munasabatna-'));
    for (const url of fresh) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
      const file = path.join(dir, path.basename(new URL(url).pathname));
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
  }

  console.log(JSON.stringify({
    scanned_at: new Date().toISOString(),
    page: PAGE,
    on_page: onPage.length,
    already_imported: onPage.length - fresh.length,
    new_count: fresh.length,
    download_dir: dir,
    new_posters: fresh
  }, null, 2));

  await db.close();
}

run().catch(err => {
  console.error(`scan failed: ${err.message}`);
  process.exit(1);
});
