const PARK_ICONS = {
  'Magic Kingdom':     'icons/magic-kingdom.svg',
  'EPCOT':             'icons/epcot.svg',
  'Hollywood Studios': 'icons/hollywood-studios.svg',
  'Animal Kingdom':    'icons/animal-kingdom.svg',
};

let activeParkFilters = new Set(['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);
let isResortGuest   = false;
let isDeluxeGuest   = false;
let showPremierPass = false;

function updateResortTier() {
  const val = document.getElementById('resort-select').value;
  isResortGuest = val !== '';
  isDeluxeGuest = val === 'deluxe';
}

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

function renderParkCell(data) {
  const earlyEntry = data.specialEvents.find(e => e.description === 'Early Entry');
  const effectiveOpen = (isResortGuest || isDeluxeGuest) && earlyEntry ? earlyEntry.openTime : data.openTime;

  const eventBadges = data.specialEvents.flatMap(e => {
    if (e.description === 'Early Entry') return [];
    if (e.description === 'Extended Evening') {
      if (!isDeluxeGuest) return [];
      return [`<span class="event-badge extended-evening">Deluxe &amp; DVC Extended Hours ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
    }
    return [`<span class="event-badge special-event">Special Ticketed Event${e.openTime ? ' ' + formatTime(e.openTime) + '–' + formatTime(e.closeTime) : ''}</span>`];
  }).join('');

  const llspItems = data.llsp.map(r => `
    <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
      <span class="cell-ll-name">${r.name}</span>
      <span class="cell-ll-price">${r.price || '—'}</span>
    </div>`).join('');

  const llmpItems = data.llmp.map(r => `
    <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
      <span class="cell-ll-name">Multi Pass</span>
      <span class="cell-ll-price">${r.price || '—'}</span>
    </div>`).join('');

  return `
    <div class="cell-hours">${formatTime(effectiveOpen)}–${formatTime(data.closeTime)}</div>
    ${eventBadges ? `<div class="cell-events">${eventBadges}</div>` : ''}
    ${llspItems ? `<div class="cell-ll-section"><div class="cell-ll-label">Single Pass</div>${llspItems}</div>` : ''}
    ${llmpItems ? `<div class="cell-ll-section"><div class="cell-ll-label">Multi Pass</div>${llmpItems}</div>` : ''}`;
}

function renderParkCard(data) {
  const icon = PARK_ICONS[data.park] ? `<img src="${PARK_ICONS[data.park]}" alt="">` : '';

  const earlyEntry = data.specialEvents.find(e => e.description === 'Early Entry');
  const effectiveOpen = (isResortGuest || isDeluxeGuest) && earlyEntry ? earlyEntry.openTime : data.openTime;

  const eventBadges = data.specialEvents.flatMap(e => {
    if (e.description === 'Early Entry') return [];
    if (e.description === 'Extended Evening') {
      if (!isDeluxeGuest) return [];
      return [`<span class="event-badge extended-evening">Deluxe &amp; DVC Resort Extended Hours ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
    }
    return [`<span class="event-badge special-event">Special Ticketed Event${e.openTime ? ' ' + formatTime(e.openTime) + '–' + formatTime(e.closeTime) : ''}</span>`];
  }).join('');

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
        <span class="hours">${formatTime(effectiveOpen)} – ${formatTime(data.closeTime)}</span>
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

  const parkOrder = ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'];
  const activeParkOrder = parkOrder.filter(p => activeParkFilters.has(p));

  const headerCells = dates.map(date => {
    const d = new Date(date + 'T12:00:00');
    const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
    const mmdd = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    return `<div class="cal-header-cell"><span class="cal-weekday">${weekday}</span><span class="cal-date">${mmdd}</span></div>`;
  }).join('');

  const parkGroups = activeParkOrder.map(parkName => {
    const icon = PARK_ICONS[parkName] ? `<img src="${PARK_ICONS[parkName]}" alt="">` : '';

    // Hours row
    const hoursRow = `
      <div class="cal-row">
        <div class="cal-row-label cal-row-label-hours">${icon}<span>${parkName}</span><span class="row-type">Hours</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          const earlyEntry = d.specialEvents.find(e => e.description === 'Early Entry');
          const effectiveOpen = (isResortGuest || isDeluxeGuest) && earlyEntry ? earlyEntry.openTime : d.openTime;
          const events = d.specialEvents.flatMap(e => {
            if (e.description === 'Early Entry') return [];
            if (e.description === 'Extended Evening') {
              if (!isDeluxeGuest) return [];
              return [`<span class="event-badge extended-evening">Deluxe &amp; DVC Extended Hours ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
            }
            return [`<span class="event-badge special-event">After-Hours Event ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
          }).join('');
          return `<div class="cal-cell">
            <div class="cell-hours">${formatTime(effectiveOpen)}–${formatTime(d.closeTime)}</div>
            ${events ? `<div class="cell-events">${events}</div>` : ''}
          </div>`;
        }).join('')}</div>
      </div>`;

    // Single Pass row
    const llspRow = `
      <div class="cal-row">
        <div class="cal-row-label"><span class="row-type-only">Single Pass</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          if (!d.llsp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
          return `<div class="cal-cell">${d.llsp.map(r => `
            <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
              <span class="cell-ll-name">${r.name}</span>
              <span class="cell-ll-price">${r.price || '—'}</span>
            </div>`).join('')}</div>`;
        }).join('')}</div>
      </div>`;

    // Multi Pass row
    const llmpRow = `
      <div class="cal-row${showPremierPass ? '' : ' cal-row-last'}">
        <div class="cal-row-label"><span class="row-type-only">Multi Pass</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          if (!d.llmp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
          return `<div class="cal-cell">${d.llmp.map(r => `
            <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
              <span class="cell-ll-name">Multi Pass</span>
              <span class="cell-ll-price">${r.price || '—'}</span>
            </div>`).join('')}</div>`;
        }).join('')}</div>
      </div>`;

    // Premier Pass row
    const premierRow = !showPremierPass ? '' : `
      <div class="cal-row cal-row-last">
        <div class="cal-row-label"><span class="row-type-only">Premier Pass</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          if (!d.llpp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
          return `<div class="cal-cell">${d.llpp.map(r => `
            <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
              <span class="cell-ll-name">Premier Pass</span>
              <span class="cell-ll-price">${r.price || '—'}</span>
            </div>`).join('')}</div>`;
        }).join('')}</div>
      </div>`;

    return `<div class="cal-park-group">${hoursRow}${llspRow}${llmpRow}${premierRow}</div>`;
  }).join('');

  planner.innerHTML = `
    <div class="calendar-grid" style="--col-count: ${dates.length}">
      <div class="cal-header">
        <div class="cal-row-label-spacer"></div>
        <div class="cal-header-cells">${headerCells}</div>
      </div>
      ${parkGroups}
    </div>`;
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

document.getElementById('resort-select').addEventListener('change', () => {
  updateResortTier();
  const planner = document.getElementById('planner');
  if (planner.innerHTML) load();
});

document.getElementById('toggle-premier').addEventListener('change', e => {
  showPremierPass = e.target.checked;
  const planner = document.getElementById('planner');
  if (planner.innerHTML) load();
});

// Pre-fill the coming week (Mon–Sun)
const today = new Date();
const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
const monday = new Date(today);
monday.setDate(today.getDate() + daysUntilMonday);
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);
document.getElementById('start-date').value = monday.toISOString().slice(0, 10);
document.getElementById('end-date').value   = sunday.toISOString().slice(0, 10);
