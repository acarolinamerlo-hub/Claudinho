'use strict';

const DATA_URL = './data/mlb_data.json';

const CAT_LABELS = {
  homeRuns: { label: 'Home Runs', abbr: 'HR', icon: 'HR' },
  battingAverage: { label: 'Média de Rebatidas', abbr: 'AVG', icon: 'BA' },
  rbi: { label: 'Corridas Impulsionadas', abbr: 'RBI', icon: 'RI' },
  stolenBases: { label: 'Bases Roubadas', abbr: 'SB', icon: 'SB' },
  onBasePlusSlugging: { label: 'OPS', abbr: 'OPS', icon: 'OP' },
  earnedRunAverage: { label: 'ERA', abbr: 'ERA', icon: 'ER' },
  wins: { label: 'Vitórias', abbr: 'W', icon: 'W' },
  strikeouts: { label: 'Strikeouts', abbr: 'K', icon: 'SO' },
  saves: { label: 'Salvamentos', abbr: 'SV', icon: 'SV' },
  whip: { label: 'WHIP', abbr: 'WHIP', icon: 'WH' },
};

let mlbData = null;
let activeLeague = 'AL';
let activeStat = 'batting';

async function loadData() {
  const resp = await fetch(DATA_URL + '?v=' + Date.now());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(isoUtc) {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function formatFetchTime(isoUtc) {
  const d = new Date(isoUtc);
  return 'Atualizado: ' + d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

// ── Games ────────────────────────────────────────────────────────────────────

function renderGames(games) {
  const grid = document.getElementById('games-grid');
  if (!games || games.length === 0) {
    grid.innerHTML = '<div class="no-games">Nenhum jogo agendado para hoje.</div>';
    return;
  }

  grid.innerHTML = games.map(g => {
    const isLive = g.statusCode === 'Live';
    const isFinal = g.statusCode === 'Final';
    const cardClass = isLive ? 'live' : isFinal ? 'final' : '';
    const statusClass = isLive ? 'live' : isFinal ? 'final' : '';

    const awayWinner = isFinal && g.away.isWinner;
    const homeWinner = isFinal && g.home.isWinner;

    let statusText = g.status;
    if (isLive && g.inning) {
      statusText = `${g.inningHalf || ''} ${g.inning}º Inning`;
    }

    const awayScore = g.away.score != null ? `<span class="team-score${awayWinner ? ' leader' : ''}">${g.away.score}</span>` : '<span class="team-score" style="color:var(--text-dim)">-</span>';
    const homeScore = g.home.score != null ? `<span class="team-score${homeWinner ? ' leader' : ''}">${g.home.score}</span>` : '<span class="team-score" style="color:var(--text-dim)">-</span>';

    const timeStr = (!isLive && !isFinal) ? `<div class="game-time">${formatTime(g.startTime)}</div>` : '';

    return `
      <div class="game-card ${cardClass}">
        <div class="game-status ${statusClass}">${statusText}</div>
        <div class="game-team ${awayWinner ? 'winner' : ''}">
          <div>
            <div class="team-abbrev">${g.away.abbreviation}</div>
            <div class="team-name-small">${g.away.name}</div>
          </div>
          ${awayScore}
        </div>
        <div class="game-team ${homeWinner ? 'winner' : ''}">
          <div>
            <div class="team-abbrev">${g.home.abbreviation}</div>
            <div class="team-name-small">${g.home.name}</div>
          </div>
          ${homeScore}
        </div>
        ${timeStr}
      </div>`;
  }).join('');
}

// ── Standings ─────────────────────────────────────────────────────────────────

function renderStandings(divisions, league) {
  const container = document.getElementById('standings-container');
  const filtered = divisions.filter(d => d.leagueAbbrev === league || d.league.includes(league === 'AL' ? 'American' : 'National'));

  if (!filtered.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">Dados de classificação indisponíveis.</p>';
    return;
  }

  container.innerHTML = filtered.map(div => {
    const rows = div.teams.map((t, i) => {
      const streakClass = t.streak.startsWith('W') ? 'w' : t.streak.startsWith('L') ? 'l' : '';
      const streakBadge = t.streak ? `<span class="streak-badge ${streakClass}">${t.streak}</span>` : '';
      return `
        <tr>
          <td>
            <div class="team-col">
              <span class="rank-badge">${i + 1}</span>
              <span>${t.name}</span>
            </div>
          </td>
          <td>${t.wins}</td>
          <td>${t.losses}</td>
          <td>${t.pct}</td>
          <td>${t.gb === '0.0' ? '-' : t.gb}</td>
          <td>${streakBadge}</td>
        </tr>`;
    }).join('');

    return `
      <div class="division-card">
        <div class="division-header">${div.name}</div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>W</th>
              <th>L</th>
              <th>PCT</th>
              <th>GB</th>
              <th>Seq</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
}

// ── Leaders ───────────────────────────────────────────────────────────────────

function renderLeaders(leaders, type) {
  const container = document.getElementById('leaders-container');
  const data = leaders[type] || {};
  const cats = Object.keys(data);

  if (!cats.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">Dados de líderes indisponíveis.</p>';
    return;
  }

  container.innerHTML = cats.map(cat => {
    const meta = CAT_LABELS[cat] || { label: cat, icon: '?' };
    const rows = (data[cat] || []).map((p, i) => `
      <div class="leader-row">
        <span class="leader-rank ${i === 0 ? 'gold' : ''}">${i === 0 ? '1' : i + 1}</span>
        <div class="leader-info">
          <div class="leader-name">${p.name}</div>
          <div class="leader-team">${p.team}</div>
        </div>
        <span class="leader-value">${p.value}</span>
      </div>`).join('');

    return `
      <div class="leader-card">
        <div class="leader-header">
          <span class="cat-icon">${meta.icon}</span>
          ${meta.label}
        </div>
        ${rows}
      </div>`;
  }).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.standings-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.standings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeLeague = btn.dataset.league;
    if (mlbData) renderStandings(mlbData.standings, activeLeague);
  });
});

document.querySelectorAll('.leaders-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.leaders-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStat = btn.dataset.stat;
    if (mlbData) renderLeaders(mlbData.leaders, activeStat);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    mlbData = await loadData();

    document.getElementById('header-date').textContent = formatDate(mlbData.date);
    document.getElementById('fetch-time').textContent = formatFetchTime(mlbData.fetchedAt);

    renderGames(mlbData.schedule);
    renderStandings(mlbData.standings, activeLeague);
    renderLeaders(mlbData.leaders, activeStat);
  } catch (err) {
    console.error(err);
    document.getElementById('games-grid').innerHTML =
      `<div class="error-banner">Erro ao carregar dados: ${err.message}. Verifique se o arquivo <code>data/mlb_data.json</code> existe.</div>`;
  }
}

init();
