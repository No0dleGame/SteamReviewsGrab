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
  search: '',      // 文本搜索
  showLang: true,  // 是否显示语言徽章
  listTime: 'all', // 列表时间窗口：all | month | week
  fetchedAtMs: Date.now(),
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
    const monthly = summary.counts_this_month ?? '--';

    document.getElementById('total').textContent = steamTotal;
    const monthlyEl = document.getElementById('monthly');
    if (monthlyEl) monthlyEl.textContent = monthly;
    document.getElementById('positive').textContent = positive;
    document.getElementById('negative').textContent = negative;
    document.getElementById('positiveRate').textContent = rate;
    const gameName = (state.games.find(g => String(g.appid) === String(appid)) || {}).name || '未命名';
    const fetchedAtStr = summary.fetched_at ? formatDateShort(new Date(summary.fetched_at)) : '';
    metaEl.textContent = `游戏: ${gameName} (appid: ${summary.appid}) | 抓取时间: ${fetchedAtStr} | 总评论数(steam): ${steamTotal} | 本次抓取数: ${grabbedTotal}`;
    // 保存抓取时间戳供时间窗口过滤使用
    state.fetchedAtMs = summary.fetched_at ? new Date(summary.fetched_at).getTime() : Date.now();

    // 语言分布图
    const dist = summary.language_distribution || [];
    const baseOrder = dist.map(d => d.language);
    const labels = dist.map(d => langZh[d.language] || d.language);
    const values = dist.map(d => d.count);

    // 计算指定时间窗口的语言分布（优先使用 summary 于 all）
    function computeLangCounts(range) {
      if (range === 'all' && dist.length) {
        return {
          labels: dist.map(d => langZh[d.language] || d.language),
          rawLabels: dist.map(d => d.language),
          values: dist.map(d => d.count)
        };
      }
      const reviews = Array.isArray(state.raw) ? state.raw : [];
      const fetchedAt = new Date(summary.fetched_at || Date.now());
      const endMs = +fetchedAt;
      let startMs = 0;
      if (range === 'week') startMs = endMs - 7 * 24 * 3600 * 1000;
      if (range === 'month') startMs = endMs - 30 * 24 * 3600 * 1000;
      const acc = new Map();
      for (const r of reviews) {
        const ts = (r.timestamp_created || r.timestamp_updated || 0) * 1000;
        if (range !== 'all' && (ts < startMs || ts > endMs)) continue;
        const lg = r.language || 'unknown';
        acc.set(lg, (acc.get(lg) || 0) + 1);
      }
      const langs = Array.from(acc.keys());
      // 使用 summary 的顺序，未知语言排在最后
      langs.sort((a, b) => {
        const ia = baseOrder.indexOf(a);
        const ib = baseOrder.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
      const rawLabels = langs;
      const lbs = langs.map(l => langZh[l] || l);
      const vals = langs.map(l => acc.get(l) || 0);
      return { labels: lbs, rawLabels, values: vals };
    }

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

    // 绑定语言分布时间选择
    const distTimeSel = document.getElementById('distTimeSelect');
    if (distTimeSel) {
      distTimeSel.value = 'all';
      distTimeSel.addEventListener('change', () => {
        const range = distTimeSel.value || 'all';
        const { labels: lb, values: vs } = computeLangCounts(range);
        state.charts.langChart.data.labels = lb;
        state.charts.langChart.data.datasets[0].data = vs;
        state.charts.langChart.update();
      });
    }

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

      // 绑定饼图时间选择
      const pieTimeSel = document.getElementById('pieTimeSelect');
      if (pieTimeSel) {
        pieTimeSel.value = 'all';
        pieTimeSel.addEventListener('change', () => {
          const range = pieTimeSel.value || 'all';
          const { labels: lb, values: vs } = computeLangCounts(range);
          state.charts.langPie.data.labels = lb;
          state.charts.langPie.data.datasets[0].data = vs;
          state.charts.langPie.update();
        });
      }
    }

    // 按语言词云（下拉选择）
  const selectEl = document.getElementById('cloudLangSelect');
  const cloudEl = document.getElementById('wordCloud');
  const timeSel = document.getElementById('cloudTimeSelect');
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

      // 分词与词频（与分析脚本对齐）
      const stopwordsZh = new Set(['的','了','和','是','在','我','你','他','她','它','不','很','也','这','那','就','都','可以','一个','没有','还有','吗','啊','呢','吧','着','给','让','会','把','被','比','到']);
      const stopwordsEn = new Set(['the','and','a','to','of','in','is','it','that','this','for','on','with','as','was','are','be','at','by','or','an','from','so','if','but','not','very','really','just']);
      function tokenize(review, language) {
        if (!review || typeof review !== 'string') return [];
        if (language === 'schinese' || language === 'tchinese') {
          const han = review.match(/[\u4e00-\u9fff]+/g);
          if (!han) return [];
          const grams = [];
          for (const seg of han) {
            for (let i = 0; i < seg.length - 1; i++) {
              const w = seg.slice(i, i + 2);
              if (!stopwordsZh.has(w)) grams.push(w);
            }
          }
          return grams;
        }
        // 英文：保留撇号作为单词内部字符，won't 作为一个词，不拆成 won + t
        const norm = review.toLowerCase().replace(/[’`]/g, "'");
        const words = norm.match(/[a-z]{2,}(?:'[a-z]{2,})*/g) || [];
        return words.filter(w => !stopwordsEn.has(w));
      }

      function computeTopWords(range, lang) {
        // all 范围优先使用 summary 预计算（更快），否则基于 state.raw 重算
        if (range === 'all') {
          if (lang === 'all') {
            const overall = summary.top_words || [];
            if (overall.length) return overall;
          } else if (byLang[lang] && byLang[lang].length) {
            return byLang[lang];
          }
        }
        const reviews = Array.isArray(state.raw) ? state.raw : [];
        if (!reviews.length) return [];
        const fetchedAt = new Date(summary.fetched_at || Date.now());
        const endMs = +fetchedAt;
        let startMs = 0;
        if (range === 'week') startMs = endMs - 7 * 24 * 3600 * 1000;
        if (range === 'month') startMs = endMs - 30 * 24 * 3600 * 1000;

        const freq = new Map();
        for (const r of reviews) {
          if (lang !== 'all' && (r.language || 'unknown') !== lang) continue;
          const ts = (r.timestamp_created || r.timestamp_updated || 0) * 1000;
          if (range !== 'all' && (ts < startMs || ts > endMs)) continue;
          const tokens = tokenize(r.review, r.language);
          for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
        }
        return Array.from(freq.entries())
          .map(([word, count]) => ({ word, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 60);
      }

      function renderCloud(lang, range) {
        let words = computeTopWords(range, lang);
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
          // 悬停显示该词出现次数
          span.title = `${w.word}: ${w.count} 条`;
          span.setAttribute('aria-label', `${w.word}: ${w.count} 条`);
          cloudEl.appendChild(span);
        });
      }

      // 初始化两个下拉，语言默认选择“全部”
      if (timeSel) {
        timeSel.value = 'all';
        timeSel.addEventListener('change', () => renderCloud(selectEl.value, timeSel.value));
      }
      selectEl.value = 'all';
      renderCloud('all', (timeSel && timeSel.value) || 'all');
      selectEl.addEventListener('change', () => renderCloud(selectEl.value, (timeSel && timeSel.value) || 'all'));
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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, delay = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateShort(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const yy = pad2(d.getFullYear() % 100);
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${yy}/${MM}/${DD} ${hh}:${mm}`;
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
    // 原始数据加载后，刷新词云以启用时间窗口筛选
    const timeSel = document.getElementById('cloudTimeSelect');
    const langSel = document.getElementById('cloudLangSelect');
    if (timeSel) {
      timeSel.dispatchEvent(new Event('change'));
    } else if (langSel) {
      langSel.dispatchEvent(new Event('change'));
    }
    // 同步刷新：语言分布与饼图的时间窗口
    const distTimeSel = document.getElementById('distTimeSelect');
    if (distTimeSel) distTimeSel.dispatchEvent(new Event('change'));
    const pieTimeSel = document.getElementById('pieTimeSelect');
    if (pieTimeSel) pieTimeSel.dispatchEvent(new Event('change'));
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
  const timeSelect = document.getElementById('listTimeSelect');
  const toggleLang = document.getElementById('toggleLangBadge');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const pageFirst = document.getElementById('pageFirst');
  const pageLast = document.getElementById('pageLast');
  const pageJumpInput = document.getElementById('pageJumpInput');
  const pageJumpBtn = document.getElementById('pageJumpBtn');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');

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
  if (timeSelect) {
    timeSelect.value = state.listTime;
    timeSelect.addEventListener('change', () => {
      state.listTime = timeSelect.value || 'all';
      state.page = 1;
      updateFiltered();
      renderList();
    });
  }
  if (toggleLang) {
    toggleLang.checked = state.showLang;
    toggleLang.addEventListener('change', () => {
      state.showLang = !!toggleLang.checked;
      const list = document.getElementById('allList');
      list.classList.toggle('hide-lang', !state.showLang);
    });
  }
  if (searchInput) {
    searchInput.value = state.search;
    const doSearch = () => {
      state.search = (searchInput.value || '').trim();
      state.page = 1;
      updateFiltered();
      renderList();
    };
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
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
  if (pageFirst) {
    pageFirst.addEventListener('click', () => {
      if (state.page !== 1) {
        state.page = 1;
        renderList();
      }
    });
  }
  if (pageLast) {
    pageLast.addEventListener('click', () => {
      const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
      if (state.page !== totalPages) {
        state.page = totalPages;
        renderList();
      }
    });
  }
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
  // 时间窗口过滤（基于 fetchedAtMs 为右边界）
  if (state.listTime && state.listTime !== 'all') {
    const endMs = state.fetchedAtMs || Date.now();
    const startMs = state.listTime === 'week'
      ? endMs - 7 * 24 * 3600 * 1000
      : endMs - 30 * 24 * 3600 * 1000;
    arr = arr.filter(r => {
      const ts = (r.timestamp_created || r.timestamp_updated || 0) * 1000;
      return ts >= startMs && ts <= endMs;
    });
  }
  if (state.search) {
    const kw = state.search.toLowerCase();
    arr = arr.filter(r => (r.review || '').toLowerCase().includes(kw));
  }

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
  const pageFirst = document.getElementById('pageFirst');
  const pageLast = document.getElementById('pageLast');
  const pageCurrent = document.getElementById('pageCurrent');

  const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
  clampPage();
  const start = (state.page - 1) * state.pageSize;
  const end = start + state.pageSize;
  const pageItems = state.filtered.slice(start, end);

  if (pageItems.length === 0) {
    list.innerHTML = '<li class="muted">无匹配的评论</li>';
  } else {
    list.classList.toggle('hide-lang', !state.showLang);
    list.innerHTML = '';
    pageItems.forEach(r => {
      const li = document.createElement('li');
      li.classList.add(r.voted_up ? 'positive' : 'negative');
      const langLabel = langZh[r.language] || r.language || '未知';
      const snippet = (r.review || '').slice(0, 300);
      const term = state.search.trim();
      const safe = escapeHtml(snippet);
      const highlighted = term ? safe.replace(new RegExp(escapeRegExp(term), 'ig'), m => `<mark>${m}</mark>`) : safe;
      const created = r.timestamp_created ? new Date(r.timestamp_created * 1000) : null;
      const createdStr = created ? formatDateShort(created) : '';
      const playHours = r.author?.playtime_forever ? (r.author.playtime_forever / 60).toFixed(1) : '0.0';
      const votesUp = r.votes_up || 0;
      li.innerHTML = `
        <div class="top-line">
          <div class="left"><span class="sentiment ${r.voted_up ? 'positive' : 'negative'}">${r.voted_up ? '好评' : '差评'}</span><span class="lang">${langLabel}</span></div>
          <div class="meta-row">
            <span class="meta-item">👍 ${votesUp}</span>
            <span class="meta-item">⌛ ${playHours}h</span>
            <span class="meta-item">${createdStr}</span>
          </div>
        </div>
        <div class="snippet">${highlighted}</div>
      `;
      list.appendChild(li);
    });
  }
  pageInfo.textContent = `第 ${state.page} / ${totalPages} 页（共 ${state.filtered.length} 条）`;
  const listTotalEl = document.getElementById('listTotal');
  if (listTotalEl) listTotalEl.textContent = `共 ${state.filtered.length} 条`;
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
  // 首/尾页按钮禁用状态
  if (pageFirst) pageFirst.disabled = state.page === 1;
  if (pageLast) pageLast.disabled = state.page === totalPages;
}