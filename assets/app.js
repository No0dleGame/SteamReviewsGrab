async function loadSummary() {
  const metaEl = document.getElementById('meta');
  try {
    const res = await fetch('data/summary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const summary = await res.json();

    // 概览
    const total = summary.counts?.total ?? summary.query_summary?.num_reviews ?? '--';
    const positive = summary.counts?.positive ?? summary.query_summary?.total_positive ?? '--';
    const negative = summary.counts?.negative ?? summary.query_summary?.total_negative ?? '--';
    const rate = summary.positive_rate != null ? `${(summary.positive_rate * 100).toFixed(1)}%` : '--';

    document.getElementById('total').textContent = total;
    document.getElementById('positive').textContent = positive;
    document.getElementById('negative').textContent = negative;
    document.getElementById('positiveRate').textContent = rate;
    metaEl.textContent = `appid: ${summary.appid} | 抓取时间: ${summary.fetched_at}`;

    // 语言分布图
    const dist = summary.language_distribution || [];
    const labels = dist.map(d => d.language);
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

    // Top 评论
    const topList = document.getElementById('topList');
    const top = summary.top_helpful_reviews || [];
    if (top.length === 0) {
      topList.innerHTML = '<li class="muted">未检测到热门评论数据</li>';
    } else {
      topList.innerHTML = '';
      top.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="top-line">
            <div><strong>${item.voted_up ? '好评' : '差评'}</strong> · <span class="lang">${item.language}</span></div>
            <div class="muted">👍 ${item.votes_up} · ⌛ ${(item.playtime_hours ?? 0).toFixed(1)}h</div>
          </div>
          <div class="snippet">${escapeHtml(item.review_snippet || '')}</div>
        `;
        topList.appendChild(li);
      });
    }
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