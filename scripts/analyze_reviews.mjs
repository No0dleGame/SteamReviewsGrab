import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dataDir = path.join(root, 'data');
const cfgPath = path.join(root, 'config.json');
const cfg = existsSync(cfgPath)
  ? JSON.parse(readFileSync(cfgPath, 'utf-8'))
  : { appid: 570 };
// 读取 games.json（如存在）以支持批量分析
let appids = [];
const gamesPath = path.join(dataDir, 'games.json');
if (existsSync(gamesPath)) {
  try {
    const arr = JSON.parse(readFileSync(gamesPath, 'utf-8'));
    if (Array.isArray(arr)) {
      appids = arr.map(g => String(g.appid)).filter(Boolean);
    }
  } catch (_) {}
}
if (appids.length === 0 && cfg.appid != null) appids = [String(cfg.appid)];

function analyzeOne(appid) {
  const appDir = path.join(dataDir, String(appid));
  const rawPathPreferred = path.join(appDir, 'raw_reviews.json');
  const rawPathFallback = path.join(dataDir, 'raw_reviews.json');
  const rawPath = existsSync(rawPathPreferred) ? rawPathPreferred : rawPathFallback;
  if (!existsSync(rawPath)) {
    console.error(`No raw_reviews.json for appid=${appid}. Run fetch first.`);
    return;
  }
  const raw = JSON.parse(readFileSync(rawPath, 'utf-8'));
// 再次去重，增强稳健性
const baseReviews = raw.reviews ?? [];
const idMap = new Map();
for (const r of baseReviews) {
  if (!r || !r.recommendationid) continue;
  idMap.set(r.recommendationid, r);
}
const reviews = Array.from(idMap.values());

  const total = reviews.length;
  const positive = reviews.filter(r => r.voted_up).length;
  const negative = total - positive;
  const positiveRate = total > 0 ? positive / total : 0;

  // 本月评论数（按 UTC，以 fetched_at 的月份为基准）
  const fetchedAt = new Date(raw.fetched_at || Date.now());
  const startMonthUtc = Date.UTC(fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth(), 1, 0, 0, 0);
  const nextMonthUtc = Date.UTC(fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth() + 1, 1, 0, 0, 0);
  const thisMonthCount = reviews.filter(r => {
    const ts = r.timestamp_created || r.timestamp_updated;
    if (!ts) return false;
    const ms = ts * 1000; // Steam 时间戳为秒
    return ms >= startMonthUtc && ms < nextMonthUtc;
  }).length;

// 语言分布统计
  const langMap = new Map();
for (const r of reviews) {
  const lang = r.language || 'unknown';
  langMap.set(lang, (langMap.get(lang) || 0) + 1);
}
  const languageDistribution = Array.from(langMap.entries())
  .map(([language, count]) => ({ language, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

// Top 热门评论（按 votes_up）
  const topHelpfulReviews = reviews
  .slice()
  .sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0))
  .slice(0, 10)
  .map(r => ({
    recommendationid: r.recommendationid,
    language: r.language,
    voted_up: r.voted_up,
    votes_up: r.votes_up,
    playtime_hours: r.author?.playtime_forever ? r.author.playtime_forever / 60 : 0,
    review_snippet: (r.review || '').slice(0, 200)
  }));

// 词频统计（基础版）
  const stopwordsZh = new Set(['的','了','和','是','在','我','你','他','她','它','不','很','也','这','那','就','都','可以','一个','没有','还有','吗','啊','呢','吧','着','给','让','会','把','被','比','到']);
  const stopwordsEn = new Set(['the','and','a','to','of','in','is','it','that','this','for','on','with','as','was','are','be','at','by','or','an','from','so','if','but','not','very','really','just']);

  function tokenize(review, language) {
  if (!review || typeof review !== 'string') return [];
  if (language === 'schinese' || language === 'tchinese') {
    const han = review.match(/[\u4e00-\u9fff]+/g);
    if (!han) return [];
    const grams = [];
    for (const seg of han) {
      // 生成双字词，过滤停用词
      for (let i = 0; i < seg.length - 1; i++) {
        const w = seg.slice(i, i + 2);
        if (!stopwordsZh.has(w)) grams.push(w);
      }
    }
    return grams;
  }
  // 英文及其他语言：按单词分割并去停用词
  const words = review.toLowerCase().match(/[a-z]{2,}/g) || [];
  return words.filter(w => !stopwordsEn.has(w));
}

  const freq = new Map();
  const freqByLang = new Map(); // language -> Map(word -> count)
for (const r of reviews) {
  const tokens = tokenize(r.review, r.language);
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
    const lang = r.language || 'unknown';
    if (!freqByLang.has(lang)) freqByLang.set(lang, new Map());
    const m = freqByLang.get(lang);
    m.set(t, (m.get(t) || 0) + 1);
  }
}
  const topWords = Array.from(freq.entries())
  .map(([word, count]) => ({ word, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 30);

// 按语言的 Top 词
  const topWordsByLanguage = {};
for (const [lang, m] of freqByLang.entries()) {
  const arr = Array.from(m.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
  topWordsByLanguage[lang] = arr;
}

  const summary = {
    appid: raw.appid,
    fetched_at: raw.fetched_at,
    counts: { total, positive, negative },
    counts_this_month: thisMonthCount,
    positive_rate: positiveRate,
    language_distribution: languageDistribution,
    top_helpful_reviews: topHelpfulReviews,
    sentiment_distribution: [
      { label: '好评', count: positive },
      { label: '差评', count: negative }
    ],
    top_words: topWords,
    top_words_by_language: topWordsByLanguage,
    query_summary: raw.query_summary ?? null
  };

  // 输出到与 raw_reviews.json 相同目录（优先 data/<appid>/summary.json）
  const outDir = path.dirname(rawPath);
  if (!existsSync(outDir)) mkdirSync(outDir);
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Saved analysis -> ${path.relative(root, path.join(outDir, 'summary.json'))}`);
}

for (const id of appids) {
  console.log(`\n=== Analyze appid=${id} ===`);
  analyzeOne(id);
}