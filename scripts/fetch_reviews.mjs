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
  // 使用 all，完整抓取历史评论；包含“离题评论活动”避免被隐藏
  url.searchParams.set('filter', 'all');
  url.searchParams.set('filter_offtopic_activity', '1');

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
    console.log(`Page ${page}: ${batch.length} reviews, cursor=${cursor?.slice(0, 24) || ''}...`);
    // 控制速率，避免被限流
    await delay(delayMs);
  }

  const out = {
    appid,
    fetched_at: new Date().toISOString(),
    // 按 recommendationid 去重，Steam 接口在分页时可能返回重复记录
    count: undefined,
    query_summary: lastQuerySummary,
    reviews: undefined
  };
  const uniqueMap = new Map();
  for (const r of all) {
    if (!r || !r.recommendationid) continue;
    uniqueMap.set(r.recommendationid, r);
  }
  const unique = Array.from(uniqueMap.values());
  out.count = unique.length;
  out.reviews = unique;

  writeFileSync(path.join(dataDir, 'raw_reviews.json'), JSON.stringify(out, null, 2));
  console.log(`Saved ${unique.length} unique reviews (from ${all.length}) -> data/raw_reviews.json`);
}

fetchAll().catch(err => {
  console.error('Fetch failed:', err);
  process.exitCode = 1;
});