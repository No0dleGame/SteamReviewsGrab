const langZh = {
  english: '英语',
  schinese: '简体中文',
  tchinese: '繁体中文',
  koreana: '韩语',
  japanese: '日语',
  russian: '俄语',
  spanish: '西班牙语',
  latam: '西语-拉美',
  portuguese: '葡萄牙语',
  brazilian: '葡萄牙语-巴西',
  german: '德语',
  french: '法语',
  thai: '泰语',
  turkish: '土耳其语',
  polish: '波兰语',
  ukrainian: '乌克兰语',
  unknown: '未知'
};

const state = {
  raw: [],
  filtered: [],
  page: 1,
  pageSize: 20,
  sort: 'latest', // latest | popular
  type: 'all',     // all | positive | negative
  lang: 'all',     // 按语言过滤
  currentApp: 'default',
  games: [],
  charts: {},
  eventsBound: false
};

async function fetchJsonSequential(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) { /* ignore */ }
  }
  throw new Error('No json available: ' + urls.join(', '));
}

async function loadSummary(appid) {
  const metaEl = document.getElementById('meta');
  try {
    const summary = await fetchJsonSequential([
      `data/${appid}/summary.json`,
      'data/summary.json'
    ]);

    // 概览
    // 使用 Steam 接口提供的总评论数（total_reviews）；缺失时回退到本次抓取数
    const steamTotal = summary.query_summary?.total_reviews ?? summary.counts?.total ?? '--';
    const grabbedTotal = summary.counts?.total ?? '--';
    const positive = summary.query_summary?.total_positive ?? summary.counts?.positive ?? '--';
    const negative = summary.query_summary?.total_negative ?? summary.counts?.negative ?? '--';
    const rate = summary.positive_rate != null ? `${(summary.positive_rate * 100).toFixed(1)}%` : '--';

    document.getElementById('total').textContent = steamTotal;
    document.getElementById('positive').textContent = positive;
    document.getElementById('negative').textContent = negative;
    document.getElementById('positiveRate').textContent = rate;
    const gameName = (state.games.find(g => String(g.appid) === String(appid)) || {}).name || '未命名';
    metaEl.textContent = `游戏: ${gameName} (appid: ${summary.appid}) | 抓取时间: ${summary.fetched_at} | 总评论数(steam): ${steamTotal} | 本次抓取数: ${grabbedTotal}`;

    // 语言分布图
    const dist = summary.language_distribution || [];
    const labels = dist.map(d => langZh[d.language] || d.language);
    const values = dist.map(d => d.count);

    // 评论列表语言筛选下拉
    const listLangSel = document.getElementById('listLangSelect');
    if (listLangSel) {
      const langs = dist.map(d => d.language);
      listLangSel.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = '全部';
      listLangSel.appendChild(optAll);
      langs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = langZh[l] || l;
        listLangSel.appendChild(opt);
      });
      listLangSel.value = 'all';
      state.lang = 'all';
    }

    const ctx = document.getElementById('langChart').getContext('2d');
    if (state.charts.langChart) { state.charts.langChart.destroy(); }
    state.charts.langChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '评论数',
          data: values,
          backgroundColor: '#4ea1ff'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#222833' }, ticks: { precision: 0 } }
        }
      }
    });

    // 语言饼图
    const langPieEl = document.getElementById('langPie');
    if (langPieEl) {
      const langPieCtx = langPieEl.getContext('2d');
      const outerBorderPlugin = {
        id: 'outerBorder',
        afterDraw(chart) {
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data || meta.data.length === 0) return;
          const arc = meta.data[0];
          const { ctx } = chart;
          const x = arc.x, y = arc.y, r = arc.outerRadius;
          ctx.save();
          ctx.strokeStyle = '#222833';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      };
      if (state.charts.langPie) { state.charts.langPie.destroy(); }
      state.charts.langPie = new Chart(langPieCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: labels.map((_, i) => `hsl(${(i * 37) % 360}deg 70% 55%)`),
            borderColor: 'transparent',
            borderWidth: 0
          }]
        },
        options: {
          cutout: '45%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                boxHeight: 8,
                padding: 10,
                font: { size: 11 }
              }
            }
          }
        },
        plugins: [outerBorderPlugin]
      });
    }

    // 按语言词云（下拉选择）
    const selectEl = document.getElementById('cloudLangSelect');
    const cloudEl = document.getElementById('wordCloud');
    if (selectEl && cloudEl) {
      const byLang = summary.top_words_by_language || {};
      const dist = summary.language_distribution || [];
      const order = dist.map(d => d.language);
      const langs = Object.keys(byLang).sort((a, b) => order.indexOf(a) - order.indexOf(b));

      // 填充下拉选项
      selectEl.innerHTML = '';
      // 全部选项
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = '全部';
      selectEl.appendChild(optAll);
      langs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = langZh[l] || l;
        selectEl.appendChild(opt);
      });

      function renderCloud(lang) {
        let words = [];
        if (lang === 'all') {
          // 优先使用汇总 top_words；缺失时合并各语言词频的前60条再聚合
          const overall = summary.top_words || [];
          if (overall.length > 0) {
            words = overall;
          } else {
            const acc = new Map();
            Object.values(byLang).forEach(arr => {
              (arr || []).slice(0, 60).forEach(w => {
                acc.set(w.word, (acc.get(w.word) || 0) + (w.count || 0));
              });
            });
            words = Array.from(acc.entries()).map(([word, count]) => ({ word, count }))
              .sort((a, b) => b.count - a.count).slice(0, 60);
          }
        } else {
          words = byLang[lang] || [];
        }
        cloudEl.innerHTML = '';
        if (!words.length) {
          cloudEl.innerHTML = '<span class="muted">暂无词频数据</span>';
          return;
        }
        const counts = words.map(w => w.count);
        const min = Math.min(...counts), max = Math.max(...counts);
        const scale = c => {
          if (max === min) return 20;
          const t = (c - min) / (max - min);
          return 14 + Math.round(t * 28); // 14px ~ 42px
        };
        words.slice(0, 60).forEach((w, idx) => {
          const span = document.createElement('span');
          const fontSize = scale(w.count);
          const hue = (idx * 23) % 360;
          span.style.fontSize = fontSize + 'px';
          span.style.color = `hsl(${hue}deg 80% 60%)`;
          span.textContent = w.word;
          cloudEl.appendChild(span);
        });
      }

      // 初始显示第一项
      const initial = langs[0];
      if (initial) {
        selectEl.value = initial;
        renderCloud(initial);
      }
      selectEl.addEventListener('change', () => renderCloud(selectEl.value));
    }

    // 已移除“高频词 Top 30”列表，改为按语言词云

    // 已移除热门评论区块，改由“评论列表”采用排序=热门来查看
  } catch (err) {
    metaEl.textContent = '未检测到分析数据，请先运行抓取与分析流程。';
  }
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function loadRaw(appid) {
  try {
    const raw = await fetchJsonSequential([
      `data/${appid}/raw_reviews.json`,
      'data/raw_reviews.json'
    ]);
    state.raw = Array.isArray(raw.reviews) ? raw.reviews : [];
    updateFiltered();
    clampPage();
    renderList();
  } catch (err) {
    const allList = document.getElementById('allList');
    allList.innerHTML = '<li class="muted">未检测到原始评论数据</li>';
  }
}

async function initGames() {
  const select = document.getElementById('appSelect');
  let games = [];
  try {
    const res = await fetch('data/games.json', { cache: 'no-store' });
    if (res.ok) {
      games = await res.json();
      if (!Array.isArray(games)) games = [];
    }
  } catch (_) { /* ignore */ }
  if (games.length === 0) {
    games = [{ appid: 'default', name: '当前游戏' }];
  }
  state.games = games;
  select.innerHTML = '';
  games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = String(g.appid);
    opt.textContent = g.name || String(g.appid);
    select.appendChild(opt);
  });
  // 默认选中第一项
  state.currentApp = String(games[0].appid);
  select.value = state.currentApp;
  await loadSummary(state.currentApp);
  await loadRaw(state.currentApp);
  attachFilterEvents();
  // 切换事件
  select.addEventListener('change', async () => {
    state.currentApp = select.value;
    state.page = 1; // 切换游戏时重置到第一页
    await loadSummary(state.currentApp);
    await loadRaw(state.currentApp);
  });
}

initGames();

function attachFilterEvents() {
  if (state.eventsBound) return; // 防止重复绑定
  const sortSelect = document.getElementById('sortSelect');
  const typeSelect = document.getElementById('typeSelect');
  const langSelect = document.getElementById('listLangSelect');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const pageJumpInput = document.getElementById('pageJumpInput');
  const pageJumpBtn = document.getElementById('pageJumpBtn');

  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    state.page = 1;
    updateFiltered();
    renderList();
  });
  typeSelect.addEventListener('change', () => {
    state.type = typeSelect.value;
    state.page = 1;
    updateFiltered();
    renderList();
  });
  if (langSelect) {
    langSelect.addEventListener('change', () => {
      state.lang = langSelect.value || 'all';
      state.page = 1;
      updateFiltered();
      renderList();
    });
  }
  pageLeft.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderList();
    }
  });
  pageRight.addEventListener('click', () => {
    const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
    if (state.page < totalPages) {
      state.page += 1;
      renderList();
    }
  });
  pageJumpBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
    const v = parseInt(pageJumpInput.value, 10);
    if (!Number.isNaN(v)) {
      state.page = Math.max(1, Math.min(totalPages, v));
      renderList();
    }
  });
  pageJumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      pageJumpBtn.click();
    }
  });
  state.eventsBound = true;
}

function updateFiltered() {
  let arr = state.raw.slice();
  if (state.type === 'positive') arr = arr.filter(r => !!r.voted_up);
  if (state.type === 'negative') arr = arr.filter(r => !r.voted_up);
  if (state.lang && state.lang !== 'all') arr = arr.filter(r => (r.language || 'unknown') === state.lang);

  if (state.sort === 'latest') {
    arr.sort((a, b) => (b.timestamp_created || 0) - (a.timestamp_created || 0));
  } else {
    arr.sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0));
  }
  state.filtered = arr;
}

function clampPage() {
  const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
  if (state.page < 1) state.page = 1;
  if (state.page > totalPages) state.page = totalPages;
}

function renderList() {
  const list = document.getElementById('allList');
  const pageInfo = document.getElementById('pageInfo');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const pageCurrent = document.getElementById('pageCurrent');

  const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
  clampPage();
  const start = (state.page - 1) * state.pageSize;
  const end = start + state.pageSize;
  const pageItems = state.filtered.slice(start, end);

  if (pageItems.length === 0) {
    list.innerHTML = '<li class="muted">无匹配的评论</li>';
  } else {
    list.innerHTML = '';
    pageItems.forEach(r => {
      const li = document.createElement('li');
      const langLabel = langZh[r.language] || r.language || '未知';
      const snippet = (r.review || '').slice(0, 300);
      const created = r.timestamp_created ? new Date(r.timestamp_created * 1000) : null;
      const createdStr = created ? created.toLocaleString() : '';
      const playHours = r.author?.playtime_forever ? (r.author.playtime_forever / 60).toFixed(1) : '0.0';
      li.innerHTML = `
        <div class="top-line">
          <div><strong>${r.voted_up ? '好评' : '差评'}</strong> · <span class="lang">${langLabel}</span></div>
          <div class="muted">👍 ${r.votes_up || 0} · ⌛ ${playHours}h · ${createdStr}</div>
        </div>
        <div class="snippet">${escapeHtml(snippet)}</div>
      `;
      list.appendChild(li);
    });
  }
  pageInfo.textContent = `第 ${state.page} / ${totalPages} 页（共 ${state.filtered.length} 条）`;
  // 更新数字分页显示：左、当前、右
  pageCurrent.textContent = String(state.page);
  // 左页
  if (state.page > 1) {
    pageLeft.textContent = String(state.page - 1);
    pageLeft.disabled = false;
  } else {
    pageLeft.textContent = '—';
    pageLeft.disabled = true;
  }
  // 右页
  if (state.page < totalPages) {
    pageRight.textContent = String(state.page + 1);
    pageRight.disabled = false;
  } else {
    pageRight.textContent = '—';
    pageRight.disabled = true;
  }
}