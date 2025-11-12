# SteamReviewsGrab

一个静态网页项目：按周（或手动）抓取指定 Steam 游戏的评论数据并分析展示。前端采用原生 HTML/JS/CSS 与 Chart.js（CDN），支持语言分布图、饼图、按语言词云与评论列表筛选。页眉支持置顶固定显示，滚动时始终可见。

## 功能概览
- 抓取：通过 Steam 官方评论接口分页抓取，包含所有语言。
- 分析：统计总数、正/负评、好评率、当月评论数、语言分布与词频。
- 展示：
  - 数据概览统计卡（总评论、本月、好评、差评、好评率）。
  - 语言分布柱状图与饼图（支持按一周/一月/全部切换）。
  - 按语言词云（支持语言与时间窗口筛选）。
  - 评论列表（排序：最新/热门；筛选：类型、语言、时间；搜索与分页；语言徽章开关）。
- 多游戏：读取 `data/games.json` 提供下拉切换不同 `appid`。

## 项目结构
```
.
├── index.html                      // 前端页面（Chart.js 通过 CDN 引入）
├── assets/
│   ├── style.css                   // 样式（深色主题、响应式、sticky 头部）
│   └── app.js                      // 前端逻辑：加载数据、渲染图表与列表
├── scripts/
│   ├── fetch_reviews.mjs           // Node 抓取脚本
│   ├── analyze_reviews.mjs         // Node 分析脚本
│   └── ps_webserver.ps1            // 本地静态预览 PowerShell 脚本
├── data/
│   ├── games.json                  // 可选：游戏列表（appid + name）
│   ├── raw_reviews.json            // 默认原始评论（无分目录时）
│   ├── summary.json                // 默认分析汇总（无分目录时）
│   └── <appid>/                    // 分游戏数据目录（推荐）
│       ├── raw_reviews.json
│       └── summary.json
├── config.json                     // 抓取配置：appid、max_pages、delay_ms
└── .github/workflows/steam-reviews.yml // GitHub Actions 工作流
```

## 使用指南

1) 配置 Steam 游戏 `appid`
- 编辑 `config.json`：
  - `appid`：目标游戏的数字 ID
  - `max_pages`：最大抓取页数（接口每页最多 100 条）
  - `delay_ms`：分页抓取的节流延迟（毫秒）

2) 本地预览网页
- Windows（推荐）：
  - 在项目根目录执行：
    - `powershell -ExecutionPolicy Bypass -File scripts/ps_webserver.ps1`
  - 终端会显示 `Preview URL: http://localhost:8080/`，浏览器打开即可
- 其他方式：任意静态服务器（如 `python -m http.server`、`npx http-server`）
- 首次没有数据时，页面会提示“未检测到分析数据”。

3) 抓取与分析（本地）
- 需要 Node.js 18+：
  - `node scripts/fetch_reviews.mjs`
  - `node scripts/analyze_reviews.mjs`
- 产物写入 `data/<appid>/raw_reviews.json` 与 `data/<appid>/summary.json`

4) GitHub Actions 定时抓取与分析
- 工作流位于 `.github/workflows/steam-reviews.yml`
- 默认每周一 00:00 UTC 触发，可在 Actions 页面手动运行
- 读取 `config.json` 参数，抓取与分析后将 `data/` 更新提交到仓库

## 数据文件说明
- `data/games.json`：`[{ appid: number|string, name: string }]`
- `data/<appid>/raw_reviews.json`：Steam 接口的 `reviews` 数组原始数据
- `data/<appid>/summary.json`：分析汇总，包含（示例字段）：
  - `appid`、`fetched_at`
  - `query_summary.total_reviews/total_positive/total_negative`
  - `counts.total/positive/negative`、`counts_this_month`、`positive_rate`
  - `language_distribution: [{ language, count }]`
  - `top_words: [{ word, count }]`、`top_words_by_language: { [lang]: [{ word, count }] }`

## 前端说明
- 库：`Chart.js` 通过 CDN 引用（`index.html:8`）
- 响应式：图表保持纵横比（避免页面被拉长），画布宽度自适应容器
- 交互：搜索输入带防抖处理，列表使用批量插入优化渲染性能
- 置顶头部：`header` 使用 sticky 固定（滚动时始终可见）

## 重要说明
- Steam 评论接口：`https://store.steampowered.com/appreviews/<appid>?json=1&language=all&review_type=all&purchase_type=all&num_per_page=100&cursor=...`
- 网页端不跨域抓取 Steam（CORS），而是读取仓库内的 `data/` 文件
- 请合理控制抓取频率与数据规模，遵循服务条款与速率限制

## 许可
本项目仅用于学习与数据展示，请合理使用。