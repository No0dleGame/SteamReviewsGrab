import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const cfgPath = path.join(root, 'config.json');
const dataDir = path.join(root, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir);

const cfg = existsSync(cfgPath)
  ? JSON.parse(readFileSync(cfgPath, 'utf-8'))
  : { appid: 570, max_pages: 30, delay_ms: 600 };

const appid = cfg.appid;
const maxPages = cfg.max_pages ?? 30;
const delayMs = cfg.delay_ms ?? 600;

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(cursor = '*') {
  const url = new URL(`https://store.steampowered.com/appreviews/${appid}`);
  url.searchParams.set('json', '1');
  url.searchParams.set('language', 'all');
  url.searchParams.set('review_type', 'all');
  url.searchParams.set('purchase_type', 'all');
  url.searchParams.set('num_per_page', '100');
  url.searchParams.set('cursor', cursor);
  // 使用创建时间排序，便于分页
  url.searchParams.set('review_date_preference', 'created');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SteamReviewsGrab/1.0 (+github actions)'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return /** @type {{success:number, cursor:string, reviews:any[], query_summary?:any}} */(await res.json());
}

async function fetchAll() {
  const all = [];
  let cursor = '*';
  let page = 0;
  let lastQuerySummary = null;

  while (page < maxPages) {
    const resp = await fetchPage(cursor);
    if (resp.success !== 1) break;
    lastQuerySummary = resp.query_summary ?? lastQuerySummary;
    const batch = resp.reviews ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    cursor = resp.cursor;
    page += 1;
    // 控制速率，避免被限流
    await delay(delayMs);
  }

  const out = {
    appid,
    fetched_at: new Date().toISOString(),
    count: all.length,
    query_summary: lastQuerySummary,
    reviews: all
  };
  writeFileSync(path.join(dataDir, 'raw_reviews.json'), JSON.stringify(out, null, 2));
  console.log(`Saved ${all.length} reviews -> data/raw_reviews.json`);
}

fetchAll().catch(err => {
  console.error('Fetch failed:', err);
  process.exitCode = 1;
});