const PARK_ICONS = {
  'Magic Kingdom':     'icons/magic-kingdom.svg',
  'EPCOT':             'icons/epcot.svg',
  'Hollywood Studios': 'icons/hollywood-studios.svg',
  'Animal Kingdom':    'icons/animal-kingdom.svg',
};

// ── App state ────────────────────────────────────────────────────────────────
let activeParkFilters = new Set(['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);
let isResortGuest   = false;
let isDeluxeGuest   = false;
let showPremierPass = false;

// Budget state
let budget = {
  travelers:  1,
  hotelNight: 0,
  flights:    0,
  transport:  0,
  ticketPerPersonPerDay: 0,
  annualPass: false,
};

// LL rider/include state
// keyed "rideName|date" -> rider count (number)
const llspRiders = new Map();
// keyed "parkName|date" -> boolean (true = included)
const llmpIncluded = new Map();

// Last loaded planner data (needed for recalc without reloading)
let lastPlannerData = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function fmtMoney(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Parse "$12.34" or "12.34" to number of cents as a float
function parsePriceStr(str) {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Budget date calculations ─────────────────────────────────────────────────
function getTripDays() {
  const start = document.getElementById('start-date').value;
  const end   = document.getElementById('end-date').value;
  if (!start || !end) return 0;
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  const diff = Math.round((e - s) / 86400000);
  return diff >= 0 ? diff + 1 : 0; // inclusive days
}

function getHotelNights() {
  const days = getTripDays();
  return days > 0 ? days - 1 : 0; // checkout day = no extra night
}

// ── recalcTotals ─────────────────────────────────────────────────────────────
function recalcTotals() {
  const { travelers, hotelNight, flights, transport, ticketPerPersonPerDay, annualPass } = budget;
  const nights = getHotelNights();
  const days   = getTripDays();

  const hotelTotal     = hotelNight * nights;
  const flightsTotal   = flights * travelers;
  const transportTotal = transport;
  const ticketsTotal   = annualPass ? 0 : ticketPerPersonPerDay * travelers * days;

  // LL Single Pass: sum over all rides in rider map
  let llspTotal = 0;
  if (lastPlannerData) {
    for (const [key, riders] of llspRiders.entries()) {
      if (riders === 0) continue;
      // key = "rideName|YYYY-MM-DD" — date is always last 10 chars, name is everything before last |
      const lastPipe = key.lastIndexOf('|');
      const rideName = key.slice(0, lastPipe);
      const date = key.slice(lastPipe + 1);
      const dayData = lastPlannerData[date];
      if (!dayData) continue;
      for (const parkData of Object.values(dayData)) {
        const ride = parkData.llsp.find(r => r.name === rideName);
        if (ride && ride.priceAmount) {
          llspTotal += ride.priceAmount * riders;
        }
      }
    }
  }

  // LL Multi Pass: sum over all park+date combos that are included
  let llmpTotal = 0;
  if (lastPlannerData) {
    for (const [key, included] of llmpIncluded.entries()) {
      if (!included) continue;
      const lastPipe = key.lastIndexOf('|');
      const parkName = key.slice(0, lastPipe);
      const date = key.slice(lastPipe + 1);
      const dayData = lastPlannerData[date];
      if (!dayData) continue;
      const parkData = dayData[parkName];
      if (!parkData || !parkData.llmp.length) continue;
      const mp = parkData.llmp[0];
      if (mp && mp.priceAmount) {
        llmpTotal += mp.priceAmount * travelers;
      }
    }
  }

  const total = hotelTotal + flightsTotal + transportTotal + ticketsTotal + llspTotal + llmpTotal;

  document.getElementById('cs-hotel-val').textContent     = fmtMoney(hotelTotal);
  document.getElementById('cs-flights-val').textContent   = fmtMoney(flightsTotal);
  document.getElementById('cs-transport-val').textContent = fmtMoney(transportTotal);
  document.getElementById('cs-tickets-val').textContent   = fmtMoney(ticketsTotal);
  document.getElementById('cs-llsp-val').textContent      = fmtMoney(llspTotal);
  document.getElementById('cs-llmp-val').textContent      = fmtMoney(llmpTotal);
  document.getElementById('cs-total-val').textContent     = fmtMoney(total);

  // Update hotel-nights note
  const hotelNote = document.getElementById('b-hotel-nights');
  if (hotelNote) {
    hotelNote.textContent = nights > 0 ? `× ${nights} night${nights !== 1 ? 's' : ''}` : '';
  }
  // Update ticket-days note
  const ticketNote = document.getElementById('b-ticket-days');
  if (ticketNote) {
    ticketNote.textContent = days > 0 ? `× ${travelers} traveler${travelers !== 1 ? 's' : ''} × ${days} day${days !== 1 ? 's' : ''}` : '';
  }
}

// ── renderParkCell (legacy helper, kept for compatibility) ───────────────────
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

// ── renderPlanner ────────────────────────────────────────────────────────────
function renderPlanner(data) {
  lastPlannerData = data;
  const planner = document.getElementById('planner');

  const dates = Object.keys(data).sort();
  if (!dates.length) {
    planner.innerHTML = '<div class="empty-state">No data found for these dates.</div>';
    recalcTotals();
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

    // Single Pass row — each cell gets rider dropdowns per ride
    const llspRow = `
      <div class="cal-row">
        <div class="cal-row-label"><span class="row-type-only">Single Pass</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          if (!d.llsp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
          const items = d.llsp.map(r => {
            const key = `${r.name}|${date}`;
            // Default to traveler count if not yet set
            if (!llspRiders.has(key) && r.available && r.priceAmount) {
              llspRiders.set(key, budget.travelers);
            }
            const currentRiders = llspRiders.get(key) ?? 0;
            const hasPrice = r.available && r.priceAmount;

            // Build dropdown options 0..travelers
            let dropdownHtml = '';
            if (hasPrice) {
              const maxR = budget.travelers;
              let opts = '';
              for (let i = 0; i <= maxR; i++) {
                opts += `<option value="${i}"${i === currentRiders ? ' selected' : ''}>${i} rider${i !== 1 ? 's' : ''}</option>`;
              }
              dropdownHtml = `<select class="llsp-riders-select" data-key="${escAttr(key)}" title="Riders for ${escAttr(r.name)}">${opts}</select>`;
            }

            return `
            <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
              <div class="cell-ll-item-top">
                <span class="cell-ll-name">${r.name}</span>
                <span class="cell-ll-price">${r.price || '—'}</span>
              </div>
              ${dropdownHtml}
            </div>`;
          }).join('');
          return `<div class="cal-cell">${items}</div>`;
        }).join('')}</div>
      </div>`;

    // Multi Pass row — each cell gets an include-travelers toggle
    const llmpRow = `
      <div class="cal-row${showPremierPass ? '' : ' cal-row-last'}">
        <div class="cal-row-label"><span class="row-type-only">Multi Pass</span></div>
        <div class="cal-row-cells">${dates.map(date => {
          const d = data[date]?.[parkName];
          if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
          if (!d.llmp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
          const mpKey = `${parkName}|${date}`;
          // Default to included if has price
          const mp = d.llmp[0];
          if (!llmpIncluded.has(mpKey) && mp.available && mp.priceAmount) {
            llmpIncluded.set(mpKey, true);
          }
          const included = llmpIncluded.get(mpKey) ?? false;
          const hasPrice = mp.available && mp.priceAmount;

          const items = d.llmp.map(r => `
            <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
              <div class="cell-ll-item-top">
                <span class="cell-ll-name">Multi Pass</span>
                <span class="cell-ll-price">${r.price || '—'}</span>
              </div>
              ${hasPrice ? `<label class="llmp-include-label">
                <input type="checkbox" class="llmp-include-check" data-key="${escAttr(mpKey)}" ${included ? 'checked' : ''}>
                <span>${budget.travelers} traveler${budget.travelers !== 1 ? 's' : ''}</span>
              </label>` : ''}
            </div>`).join('');
          return `<div class="cal-cell">${items}</div>`;
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
              <div class="cell-ll-item-top">
                <span class="cell-ll-name">Premier Pass</span>
                <span class="cell-ll-price">${r.price || '—'}</span>
              </div>
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

  recalcTotals();
}

// ── Attribute escaping helper ─────────────────────────────────────────────────
function escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Status ───────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'error' : 'loading';
  el.style.display = msg ? 'block' : 'none';
}

// ── Load ─────────────────────────────────────────────────────────────────────
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

// ── Event listeners ───────────────────────────────────────────────────────────

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

// Budget toggle
document.getElementById('budget-toggle-btn').addEventListener('click', () => {
  const panel = document.getElementById('budget-panel');
  panel.hidden = !panel.hidden;
  document.getElementById('budget-toggle-btn').classList.toggle('active', !panel.hidden);
});

// Budget input listeners
document.getElementById('b-travelers').addEventListener('input', e => {
  budget.travelers = Math.max(1, parseInt(e.target.value) || 1);
  // Re-render if data loaded so dropdowns update their max
  if (lastPlannerData) renderPlanner(lastPlannerData);
  else recalcTotals();
});

document.getElementById('b-hotel').addEventListener('input', e => {
  budget.hotelNight = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-flights').addEventListener('input', e => {
  budget.flights = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-transport').addEventListener('input', e => {
  budget.transport = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-tickets').addEventListener('input', e => {
  budget.ticketPerPersonPerDay = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-annual-pass').addEventListener('change', e => {
  budget.annualPass = e.target.checked;
  const ticketsInput = document.getElementById('b-tickets');
  ticketsInput.disabled = budget.annualPass;
  ticketsInput.style.opacity = budget.annualPass ? '0.4' : '';
  recalcTotals();
});

// Date change triggers recalc for hotel nights and ticket days
document.getElementById('start-date').addEventListener('change', recalcTotals);
document.getElementById('end-date').addEventListener('change', recalcTotals);

// LL Single Pass rider dropdowns (delegated from planner)
document.getElementById('planner').addEventListener('change', e => {
  if (e.target.classList.contains('llsp-riders-select')) {
    const key = e.target.dataset.key;
    llspRiders.set(key, parseInt(e.target.value));
    recalcTotals();
  }
  if (e.target.classList.contains('llmp-include-check')) {
    const key = e.target.dataset.key;
    llmpIncluded.set(key, e.target.checked);
    recalcTotals();
  }
});

// Cost summary bar — clicking a category scrolls to / opens budget panel and highlights the input
document.getElementById('cost-summary-bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;
  const targetId = btn.dataset.target;
  const panel = document.getElementById('budget-panel');
  if (panel.hidden) {
    panel.hidden = false;
    document.getElementById('budget-toggle-btn').classList.add('active');
  }
  const input = document.getElementById(targetId);
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    input.focus();
    input.select();
    input.classList.add('budget-highlight');
    setTimeout(() => input.classList.remove('budget-highlight'), 1200);
  }
});

// ── Initial setup ─────────────────────────────────────────────────────────────
// Pre-fill the coming week (Mon–Sun)
const today = new Date();
const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
const monday = new Date(today);
monday.setDate(today.getDate() + daysUntilMonday);
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);
document.getElementById('start-date').value = monday.toISOString().slice(0, 10);
document.getElementById('end-date').value   = sunday.toISOString().slice(0, 10);

// Initial recalc to show $0 properly
recalcTotals();
