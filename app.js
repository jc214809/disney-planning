const PARK_ICONS = {
  'Magic Kingdom':     'icons/magic-kingdom.svg',
  'EPCOT':             'icons/epcot.svg',
  'Hollywood Studios': 'icons/hollywood-studios.svg',
  'Animal Kingdom':    'icons/animal-kingdom.svg',
};

let activeParkFilters = new Set(['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })
    + ' — ' + d.toLocaleDateString(undefined, { weekday: 'long' });
}

function renderBadge(available) {
  return available
    ? `<span class="badge yes">● YES</span>`
    : `<span class="badge no">● NO</span>`;
}

function renderParkCard(data) {
  const icon = PARK_ICONS[data.park] ? `<img src="${PARK_ICONS[data.park]}" alt="">` : '';

  const eventBadges = data.specialEvents.map(e =>
    `<span class="event-badge">${e.name}${e.openTime ? ' ' + formatTime(e.openTime) + '–' + formatTime(e.closeTime) : ''}</span>`
  ).join('');

  const llspRows = data.llsp.length
    ? data.llsp.map(r => `
        <tr class="${r.available ? 'available' : 'unavailable'}">
          <td>${r.name}</td>
          <td class="price">${r.price || '—'}</td>
          <td>${renderBadge(r.available)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty">No Single Pass rides listed</td></tr>`;

  const llmpRows = data.llmp.length
    ? data.llmp.map(r => `
        <tr class="${r.available ? 'available' : 'unavailable'}">
          <td>${r.name}</td>
          <td class="price">${r.price || '—'}</td>
          <td>${renderBadge(r.available)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty">No Multi Pass listed</td></tr>`;

  return `
    <div class="park-card">
      <div class="park-header">
        ${icon}<span>${data.park}</span>
        <span class="hours">${formatTime(data.openTime)} – ${formatTime(data.closeTime)}</span>
      </div>
      ${eventBadges ? `<div class="events">${eventBadges}</div>` : ''}
      <div class="ll-section">
        <div class="ll-label">Single Pass</div>
        <table>
          <thead><tr><th>Ride</th><th>Price</th><th>Available</th></tr></thead>
          <tbody>${llspRows}</tbody>
        </table>
      </div>
      <div class="ll-section">
        <div class="ll-label">Multi Pass</div>
        <table>
          <thead><tr><th>Ride</th><th>Price</th><th>Available</th></tr></thead>
          <tbody>${llmpRows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderPlanner(data) {
  const planner = document.getElementById('planner');

  const dates = Object.keys(data).sort();
  if (!dates.length) {
    planner.innerHTML = '<div class="empty-state">No data found for these dates.</div>';
    return;
  }

  planner.innerHTML = dates.map(date => {
    const parks = Object.keys(data[date])
      .filter(p => activeParkFilters.has(p))
      .sort();

    const cards = parks.map(p => renderParkCard(data[date][p])).join('');

    return `
      <div class="day-section">
        <div class="day-header">${formatDate(date)}</div>
        <div class="day-cards">${cards}</div>
      </div>`;
  }).join('');
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'error' : 'loading';
  el.style.display = msg ? 'block' : 'none';
}

async function load() {
  const start = document.getElementById('start-date').value;
  const end   = document.getElementById('end-date').value;

  if (!start || !end) { setStatus('Please select a start and end date.', true); return; }
  if (start > end)    { setStatus('Start date must be before end date.', true); return; }

  setStatus('Loading park data…');
  document.getElementById('planner').innerHTML = '';

  try {
    const data = await loadPlannerData(start, end);
    renderPlanner(data);
    setStatus('');
  } catch (err) {
    setStatus(`Error loading data: ${err.message}`, true);
  }
}

// Park toggle buttons
document.getElementById('park-toggles').addEventListener('click', e => {
  const btn = e.target.closest('.park-toggle');
  if (!btn) return;
  const park = btn.dataset.park;
  if (activeParkFilters.has(park)) {
    activeParkFilters.delete(park);
    btn.classList.remove('active');
  } else {
    activeParkFilters.add(park);
    btn.classList.add('active');
  }
  // Re-render with current data if already loaded
  const planner = document.getElementById('planner');
  if (planner.innerHTML) load();
});

document.getElementById('load-btn').addEventListener('click', load);

// Pre-fill today + 7 days as a default
const today = new Date();
const weekOut = new Date(today);
weekOut.setDate(today.getDate() + 6);
document.getElementById('start-date').value = today.toISOString().slice(0, 10);
document.getElementById('end-date').value   = weekOut.toISOString().slice(0, 10);
