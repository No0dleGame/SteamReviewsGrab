# SteamReviewsGrab

一个简洁的静态网页项目，按月自动抓取指定 Steam 游戏的所有评论（包含所有语言），并进行基础数据分析（正负评数量、语言分布、热度等），通过 GitHub Actions 定时执行，网页端展示分析结果。

## 功能概览
- 通过 Steam 官方评论接口按页抓取评论数据（包含所有语言）。
- 每月定时（或手动触发）运行抓取与分析流程。
- 输出原始数据和分析汇总到 `data/` 目录。
- 网页读取 `data/summary.json` 展示关键指标与分布图。

## 项目结构
```
.
├── index.html                // 前端页面
├── assets/
│   ├── style.css             // 简单样式
│   └── app.js                // 前端逻辑，加载 summary 并渲染
├── scripts/
│   ├── fetch_reviews.mjs     // Node 脚本：抓取评论
│   └── analyze_reviews.mjs   // Node 脚本：分析评论
├── data/
│   └── .gitkeep              // 保持目录存在
├── config.json               // 配置：appid、抓取页数、延迟等
└── .github/workflows/steam-reviews.yml  // GitHub Actions 工作流
```

## 使用指南

1) 配置 Steam 游戏 `appid`
- 编辑 `config.json`，将 `appid` 改为目标游戏的数字 ID（例如 Dota 2 为 570）。

2) 本地预览网页
- 可使用任意静态服务器（如 `python -m http.server` 或 `npx http-server`）在项目根目录启动，访问 `http://localhost:8080`（或你的端口）。
- 首次没有数据时，页面会提示“未检测到分析数据”。

3) GitHub Actions 定时抓取与分析
- 将仓库推送到 GitHub。
- 工作流位于 `.github/workflows/steam-reviews.yml`，默认在每月 1 日 00:00 UTC 触发，也可在 Actions 页面手动 `Run workflow`。
- 工作流会：
  - 读取 `config.json` 中的 `appid`、`max_pages`（最大抓取页数）、`delay_ms`（分页抓取间隔）。
  - 抓取评论并保存到 `data/raw_reviews.json`。
  - 分析生成 `data/summary.json` 并提交到仓库。

4) 网页展示内容
- 页面读取 `data/summary.json` 显示：
  - 总评论数、正评数、负评数、好评率。
  - 语言分布条形图。
  - Top 10 热门评论（按点赞数）。

## 重要说明
- Steam 评论接口：`https://store.steampowered.com/appreviews/<appid>?json=1&language=all&review_type=all&purchase_type=all&num_per_page=100&cursor=...`
- 由于评论量可能非常大，默认限制 `max_pages` 为 30（约 3000 条）。你可以按需上调，但请注意仓库膨胀与速率限制。
- 网页端不直接跨域抓取 Steam（受 CORS 限制），而是读取本仓库中由 Actions 生成的 `summary.json`。

## 本地调试（手动运行脚本）
确保已安装 Node.js 18+。在项目根目录执行：

```
node scripts/fetch_reviews.mjs
node scripts/analyze_reviews.mjs
```

完成后将在 `data/` 生成 `raw_reviews.json` 与 `summary.json`，再通过静态服务器预览网页即可。

## 配置文件示例（config.json）
```
{
  "appid": 570,
  "max_pages": 30,
  "delay_ms": 600
}
```

## 许可
本项目仅用于学习与数据展示，请合理控制抓取频率与数据规模，遵循相关服务条款。