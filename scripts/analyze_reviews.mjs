import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dataDir = path.join(root, 'data');
const rawPath = path.join(dataDir, 'raw_reviews.json');

if (!existsSync(rawPath)) {
  console.error('No raw_reviews.json found. Run fetch_reviews.mjs first.');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawPath, 'utf-8'));
const reviews = raw.reviews ?? [];

const total = reviews.length;
const positive = reviews.filter(r => r.voted_up).length;
const negative = total - positive;
const positiveRate = total > 0 ? positive / total : 0;

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

const summary = {
  appid: raw.appid,
  fetched_at: raw.fetched_at,
  counts: { total, positive, negative },
  positive_rate: positiveRate,
  language_distribution: languageDistribution,
  top_helpful_reviews: topHelpfulReviews,
  query_summary: raw.query_summary ?? null
};

writeFileSync(path.join(dataDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Saved analysis -> data/summary.json');