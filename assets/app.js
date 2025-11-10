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
  type: 'all'     // all | positive | negative
};

async function loadSummary() {
  const metaEl = document.getElementById('meta');
  try {
    const res = await fetch('data/summary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const summary = await res.json();

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
    metaEl.textContent = `appid: ${summary.appid} | 抓取时间: ${summary.fetched_at} | 总评论数(steam): ${steamTotal} | 本次抓取数: ${grabbedTotal}`;

    // 语言分布图
    const dist = summary.language_distribution || [];
    const labels = dist.map(d => langZh[d.language] || d.language);
    const values = dist.map(d => d.count);

    const ctx = document.getElementById('langChart').getContext('2d');
    new Chart(ctx, {
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
      new Chart(langPieCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: labels.map((_, i) => `hsl(${(i * 37) % 360}deg 70% 55%)`)
          }]
        },
        options: {
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // 情绪饼图（好评/差评）
    const sentPieEl = document.getElementById('sentPie');
    if (sentPieEl) {
      const sentPieCtx = sentPieEl.getContext('2d');
      const sentDist = summary.sentiment_distribution || [];
      new Chart(sentPieCtx, {
        type: 'doughnut',
        data: {
          labels: sentDist.map(s => s.label),
          datasets: [{
            data: sentDist.map(s => s.count),
            backgroundColor: ['#52c41a', '#ff4d4f']
          }]
        },
        options: {
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // 高频词列表
    const topWordsEl = document.getElementById('topWords');
    if (topWordsEl) {
      const words = summary.top_words || [];
      if (words.length === 0) {
        topWordsEl.innerHTML = '<li class="muted">暂无词频数据</li>';
      } else {
        topWordsEl.innerHTML = '';
        words.forEach(w => {
          const li = document.createElement('li');
          li.innerHTML = `<div class="top-line"><div>${escapeHtml(w.word)}</div><div class="muted">${w.count}</div></div>`;
          topWordsEl.appendChild(li);
        });
      }
    }

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

loadSummary();
loadRaw();
async function loadRaw() {
  try {
    const res = await fetch('data/raw_reviews.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    state.raw = Array.isArray(raw.reviews) ? raw.reviews : [];
    updateFiltered();
    renderList();
    attachFilterEvents();
  } catch (err) {
    const allList = document.getElementById('allList');
    allList.innerHTML = '<li class="muted">未检测到原始评论数据</li>';
  }
}

function attachFilterEvents() {
  const sortSelect = document.getElementById('sortSelect');
  const typeSelect = document.getElementById('typeSelect');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

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
  prevBtn.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderList();
    }
  });
  nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
    if (state.page < totalPages) {
      state.page += 1;
      renderList();
    }
  });
}

function updateFiltered() {
  let arr = state.raw.slice();
  if (state.type === 'positive') arr = arr.filter(r => !!r.voted_up);
  if (state.type === 'negative') arr = arr.filter(r => !r.voted_up);

  if (state.sort === 'latest') {
    arr.sort((a, b) => (b.timestamp_created || 0) - (a.timestamp_created || 0));
  } else {
    arr.sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0));
  }
  state.filtered = arr;
}

function renderList() {
  const list = document.getElementById('allList');
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
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
  prevBtn.disabled = state.page <= 1;
  nextBtn.disabled = state.page >= totalPages;
}