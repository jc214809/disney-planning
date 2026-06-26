/**
 * Google Sheets integration — Disney Trip Planner
 *
 * Flow:
 *   1. gapi + GIS load → "Sign in" button appears in header top-right.
 *   2. User clicks Sign in → OAuth popup → avatar + name shown.
 *   3. On sign-in: search Drive for "Disney Trip Planner" spreadsheet.
 *      Found → open it. Not found → create it with a "Sheet1" tab.
 *   4. Sheets panel shows tab dropdown + Save / Load / Rename / New tab.
 *   5. Clicking avatar shows a mini dropdown with Sign out.
 *
 * GOOGLE_CLIENT_ID and GOOGLE_API_KEY loaded from config.js (gitignored).
 */

const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';
const WORKBOOK_NAME = 'Disney Trip Planner';
const DISCOVERY_DOCS = [
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
];

// ── State ─────────────────────────────────────────────────────────────────────
let gapiReady            = false;
let gisReady             = false;
let tokenClient          = null;
let currentSpreadsheetId = null;
let currentSheetName     = null;
let signedIn             = false;
let stateDirty           = false;

// ── Dirty tracking ────────────────────────────────────────────────────────────
function markDirty() {
  if (!signedIn || !currentSheetName) return;
  stateDirty = true;
  const saveBtn = document.getElementById('sheets-save-btn');
  if (saveBtn) saveBtn.classList.add('dirty');
}

function clearDirty() {
  stateDirty = false;
  const saveBtn = document.getElementById('sheets-save-btn');
  if (saveBtn) saveBtn.classList.remove('dirty');
  dismissUnsavedBanner();
}

function dismissUnsavedBanner() {
  const banner = document.getElementById('unsaved-banner');
  if (banner) banner.remove();
}

// Shows an inline confirmation strip. onSave and onDiscard are callbacks.
function showUnsavedBanner(onSave, onDiscard) {
  dismissUnsavedBanner();
  const bar = document.getElementById('trip-name-bar');
  if (!bar) { onDiscard(); return; }

  const banner = document.createElement('div');
  banner.id = 'unsaved-banner';
  banner.className = 'unsaved-banner';
  banner.innerHTML = `
    <span class="unsaved-banner-msg">You have unsaved changes to <strong>${currentSheetName}</strong>.</span>
    <button class="unsaved-btn-save">Save &amp; Switch</button>
    <button class="unsaved-btn-discard">Discard</button>
  `;
  bar.insertAdjacentElement('afterend', banner);

  banner.querySelector('.unsaved-btn-save').addEventListener('click', async () => {
    dismissUnsavedBanner();
    await onSave();
  });
  banner.querySelector('.unsaved-btn-discard').addEventListener('click', () => {
    dismissUnsavedBanner();
    onDiscard();
  });
}

// ── gapi / GIS bootstrap ──────────────────────────────────────────────────────
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
    gapiReady = true;
    checkReady();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope:     SCOPES,
    callback:  () => {},
  });

  // One Tap: fires silently if user has active Google session.
  // Only attempt on localhost — GitHub Pages blocks the silent token exchange.
  const savedId    = localStorage.getItem('sheets_spreadsheet_id');
  const savedEmail = localStorage.getItem('sheets_user_email');
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (savedId && isLocalhost) {
    google.accounts.id.initialize({
      client_id:              GOOGLE_CLIENT_ID,
      callback:               onOneTapCredential,
      auto_select:            true,
      cancel_on_tap_outside:  false,
      login_hint:             savedEmail || '',
    });
    google.accounts.id.prompt(notification => {
      if (notification.isSkippedMoment() || notification.isDismissedMoment()) {
        showReconnectPrompt();
      }
    });
  } else if (savedId) {
    // On non-localhost (e.g. GitHub Pages), skip One Tap and show reconnect button
    showReconnectPrompt();
  }

  gisReady = true;
  checkReady();
}

function onOneTapCredential(credentialResponse) {
  // One Tap gave us an ID token — now get an access token silently using that hint
  const savedId    = localStorage.getItem('sheets_spreadsheet_id');
  const savedEmail = localStorage.getItem('sheets_user_email');
  tokenClient.callback = async (resp) => {
    if (resp.error || resp.error_description) { showReconnectPrompt(); return; }
    try {
      gapi.client.setToken({ access_token: resp.access_token });
      await autoReconnect(savedId);
    } catch (_) {
      showReconnectPrompt();
    }
  };
  try {
    tokenClient.requestAccessToken({ prompt: '', login_hint: savedEmail || '' });
  } catch (_) {
    showReconnectPrompt();
  }
}

function checkReady() {
  if (!gapiReady || !gisReady) return;
  renderAuthButton();

  // If no saved session, the header sign-in button is already visible via renderAuthButton()
}

function showReconnectPrompt() {
  const btn = document.getElementById('google-auth-btn');
  if (!btn) return;
  btn.hidden = false;
  const savedEmail = localStorage.getItem('sheets_user_email') || '';
  btn.innerHTML = `<svg class="g-logo" viewBox="0 0 24 24" width="16" height="16"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span class="g-name">Reconnect${savedEmail ? ' · ' + savedEmail.split('@')[0] : ''}</span>`;
  btn.title = 'Click to reconnect' + (savedEmail ? ' as ' + savedEmail : '');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function ensureToken() {
  return new Promise((resolve, reject) => {
    if (gapi.client.getToken()) { resolve(); return; }
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

async function signIn() {
  try {
    await ensureToken();
  } catch (e) {
    setSheetsStatus('Sign-in failed: ' + e.message, true);
    return;
  }
  signedIn = true;
  await loadUserProfile();
  await findOrCreateWorkbook();
}

function signOut() {
  const token = gapi.client.getToken();
  if (token) google.accounts.oauth2.revoke(token.access_token, () => {});
  gapi.client.setToken(null);
  signedIn = false;
  currentSpreadsheetId = null;
  currentSheetName     = null;
  localStorage.removeItem('sheets_spreadsheet_id');
  localStorage.removeItem('sheets_tab_name');
  localStorage.removeItem('sheets_user_email');
  renderAuthButton();
  hideSheetsControls();
  setSheetsStatus('');
  closeUserMenu();
  clearDirty();

  // Reset all app state since it can no longer be saved
  if (typeof applyAppState === 'function') {
    applyAppState({
      startDate: '',
      endDate: '',
      travelers: 1,
      flights: 0,
      flightsMode: 'person',
      transport: 0,
      annualPass: false,
      ticketPerPersonPerDay: 0,
      hotels: [],
      activeParkFilters: ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'],
      showPremierPass: false,
      llspRiders: [],
      llmpIncluded: [],
    });
  }
  document.getElementById('start-date').value = '';
  document.getElementById('end-date').value   = '';
  document.getElementById('planner').innerHTML = '';
}

// ── User profile ──────────────────────────────────────────────────────────────
async function loadUserProfile() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token },
    });
    const info = await res.json();
    if (info.email) localStorage.setItem('sheets_user_email', info.email);
    renderAuthButton(info);
  } catch (_) {
    renderAuthButton();
  }
}


// ── Auth button rendering ──────────────────────────────────────────────────────
function renderAuthButton(userInfo = null) {
  const btn = document.getElementById('google-auth-btn');
  if (!btn) return;

  if (!gapiReady || !gisReady) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;

  if (signedIn && userInfo) {
    btn.innerHTML = userInfo.picture
      ? `<img class="g-avatar" src="${userInfo.picture}" alt="${userInfo.name}" referrerpolicy="no-referrer"><span class="g-name">${userInfo.given_name || userInfo.name}</span>`
      : `<span class="g-name">${userInfo.name}</span>`;
    btn.title = 'Signed in as ' + userInfo.email;
  } else if (signedIn) {
    btn.innerHTML = `<span class="g-name">Signed in</span>`;
  } else {
    btn.innerHTML = `<svg class="g-logo" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span class="g-name">Sign in</span>`;
    btn.title = 'Sign in with Google';
  }
}

// ── User menu ──────────────────────────────────────────────────────────────────
function toggleUserMenu() {
  const menu = document.getElementById('google-user-menu');
  if (!menu) return;
  menu.hidden = !menu.hidden;
}

function closeUserMenu() {
  const menu = document.getElementById('google-user-menu');
  if (menu) menu.hidden = true;
}

// ── Find or create workbook ───────────────────────────────────────────────────
async function findOrCreateWorkbook() {
  setSheetsStatus('Looking for "' + WORKBOOK_NAME + '"…');
  try {
    // Search Drive for existing workbook created by this app
    const search = await gapi.client.drive.files.list({
      q: `name='${WORKBOOK_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive',
      pageSize: 1,
    });

    let spreadsheetId;
    if (search.result.files.length > 0) {
      spreadsheetId = search.result.files[0].id;
      setSheetsStatus('Found existing workbook.');
    } else {
      setSheetsStatus('Creating "' + WORKBOOK_NAME + '"…');
      const created = await gapi.client.sheets.spreadsheets.create({
        resource: { properties: { title: WORKBOOK_NAME } },
      });
      spreadsheetId = created.result.spreadsheetId;
      setSheetsStatus('Created new workbook.');
    }

    currentSpreadsheetId = spreadsheetId;
    localStorage.setItem('sheets_spreadsheet_id', spreadsheetId);
    await loadSheetTabs();
  } catch (e) {
    setSheetsStatus('Error: ' + (e.result?.error?.message || e.message), true);
  }
}

function pickDefaultTab(sheets) {
  // Try to use the saved tab first
  const savedTab = localStorage.getItem('sheets_tab_name');
  if (savedTab && sheets.includes(savedTab)) return savedTab;

  // Otherwise find the most upcoming trip by parsing start date from tab name
  // Format: "Jun 28 – Jul 4 · Grand Floridian" or similar
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const year = now.getFullYear();

  let bestTab  = sheets[0];
  let bestDiff = Infinity;

  for (const name of sheets) {
    // Grab everything before the dash or middle-dot
    const dateStr = name.split(/[–·]/)[0].trim();
    // Try parsing with current year, then next year
    for (const y of [year, year + 1]) {
      const d = new Date(`${dateStr} ${y}`);
      if (isNaN(d)) continue;
      const diff = d - now;
      // Prefer upcoming trips (diff >= 0), then least-past
      if (Math.abs(diff) < Math.abs(bestDiff) || (diff >= 0 && bestDiff < 0)) {
        bestDiff = diff;
        bestTab  = name;
      }
      break;
    }
  }
  return bestTab;
}

async function loadSheetTabs() {
  const res = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: currentSpreadsheetId,
    fields: 'sheets/properties/title',
  });
  const sheets = res.result.sheets.map(s => s.properties.title);
  populateSheetDropdown(sheets);

  const defaultTab = pickDefaultTab(sheets);
  const select      = document.getElementById('sheets-tab-select');
  const headerSelect = document.getElementById('header-trip-select');
  if (select)       select.value = defaultTab;
  if (headerSelect) headerSelect.value = defaultTab;
  currentSheetName = defaultTab;
  const nameInput = document.getElementById('sheets-tab-name');
  if (nameInput) { nameInput.value = defaultTab; nameInput.dataset.userEdited = 'true'; }
  setTripNameDisplay(defaultTab);

  setSheetsStatus('Ready.');
  if (currentSheetName) await loadFromSheet();
}

async function autoReconnect(id) {
  try {
    signedIn = true;
    await loadUserProfile();
    currentSpreadsheetId = id;
    await loadSheetTabs();
  } catch (_) {
    signedIn = false;
    hideSheetsControls();
    setSheetsStatus('');
    showReconnectPrompt();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setSheetsStatus(msg, isError = false) {
  const el = document.getElementById('sheets-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'sheets-status' + (isError ? ' sheets-status-error' : msg ? ' sheets-status-info' : '');
}

function setSaveLoadEnabled(enabled) {
  ['sheets-save-btn', 'sheets-new-tab-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function hideSheetsControls() {
  for (const id of ['header-trips', 'trip-name-bar', 'cost-summary-bar']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  const controls = document.querySelector('.controls');
  if (controls) controls.hidden = true;
  const budgetPanel = document.getElementById('budget-panel');
  if (budgetPanel) budgetPanel.hidden = true;
  document.getElementById('budget-toggle-btn')?.classList.remove('active');
  setSaveLoadEnabled(false);

  for (const selId of ['sheets-tab-select', 'header-trip-select']) {
    const sel = document.getElementById(selId);
    if (sel) sel.innerHTML = '';
  }
  setTripNameDisplay('');
}

function setTripNameDisplay(name) {
  const text = document.getElementById('trip-name-text');
  if (text) text.textContent = name || 'New Trip';
}

function openTripNameEdit() {
  const nameText  = document.getElementById('trip-name-text');
  const editBtn   = document.getElementById('trip-name-edit-btn');
  const input     = document.getElementById('sheets-tab-name');
  const renameBtn = document.getElementById('sheets-rename-btn');
  const cancelBtn = document.getElementById('trip-name-cancel-btn');
  if (nameText)  nameText.hidden  = true;
  if (editBtn)   editBtn.hidden   = true;
  if (input)     { input.hidden = false; delete input.dataset.userEdited; input.focus(); input.select(); }
  if (renameBtn) { renameBtn.hidden = false; renameBtn.disabled = (input?.value.trim() === currentSheetName); }
  if (cancelBtn) cancelBtn.hidden = false;
}

function closeTripNameEdit() {
  const nameText  = document.getElementById('trip-name-text');
  const editBtn   = document.getElementById('trip-name-edit-btn');
  const input     = document.getElementById('sheets-tab-name');
  const renameBtn = document.getElementById('sheets-rename-btn');
  const cancelBtn = document.getElementById('trip-name-cancel-btn');
  if (nameText)  nameText.hidden  = false;
  if (editBtn)   editBtn.hidden   = false;
  if (input)     input.hidden     = true;
  if (renameBtn) renameBtn.hidden = true;
  if (cancelBtn) cancelBtn.hidden = true;
}

function refreshSheetsTabName() {
  // Only update the input if the edit row is open and the user hasn't manually typed
  const input = document.getElementById('sheets-tab-name');
  if (!input || input.hidden || input.dataset.userEdited === 'true') return;
  const name = defaultTabName();
  input.value = name;
  const renameBtn = document.getElementById('sheets-rename-btn');
  if (renameBtn) renameBtn.disabled = (name === currentSheetName);
}

function defaultTabName() {
  const state = getAppState();
  const parts  = [];

  if (state.startDate && state.endDate) {
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    parts.push(`${fmt(state.startDate)} – ${fmt(state.endDate)}`);
  }

  if (Array.isArray(state.hotels) && state.hotels.length) {
    const names = state.hotels
      .map(h => h.resort)
      .filter(Boolean)
      .map(r => r.replace(/ Resort.*$/, '').replace(/ Hotel.*$/, '').trim());
    if (names.length) parts.push(names.join(' + '));
  }

  return parts.length ? parts.join(' · ') : 'New Trip';
}

function populateSheetDropdown(sheets) {
  // Header trip selector
  const headerSelect = document.getElementById('header-trip-select');
  if (headerSelect) {
    headerSelect.innerHTML = sheets.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
  }
  const headerTrips = document.getElementById('header-trips');
  if (headerTrips) headerTrips.hidden = false;

  // Legacy panel select (kept for compat, hidden in UI)
  const select = document.getElementById('sheets-tab-select');
  if (select) {
    select.innerHTML = sheets.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
  }

  currentSheetName = sheets[0];
  setSaveLoadEnabled(true);

  // Show controls, trip name bar, and cost bar
  const controls = document.querySelector('.controls');
  if (controls) controls.hidden = false;
  for (const id of ['trip-name-bar', 'cost-summary-bar']) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  const nameInput = document.getElementById('sheets-tab-name');
  const displayName = (nameInput && nameInput.dataset.userEdited !== 'true') ? defaultTabName() : (currentSheetName || 'New Trip');
  if (nameInput && nameInput.dataset.userEdited !== 'true') nameInput.value = displayName;
  setTripNameDisplay(currentSheetName || displayName);
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveToSheet() {
  if (!currentSpreadsheetId || !currentSheetName) return;
  setSheetsStatus('Saving…');

  const state = getAppState();
  const rows  = [['key', 'value']];
  for (const [k, v] of Object.entries(state)) {
    rows.push([k, typeof v === 'string' ? v : JSON.stringify(v)]);
  }

  try {
    await ensureToken();
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: currentSpreadsheetId,
      range: `'${currentSheetName}'!A1`,
      valueInputOption: 'RAW',
      resource: { values: rows },
    });
    const clearStart = rows.length + 1;
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: currentSpreadsheetId,
      range: `'${currentSheetName}'!A${clearStart}:B1000`,
    });
    clearDirty();
    setSheetsStatus(`Saved to "${currentSheetName}".`);
  } catch (e) {
    setSheetsStatus('Save failed: ' + (e.result?.error?.message || e.message), true);
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadFromSheet() {
  if (!currentSpreadsheetId || !currentSheetName) return;
  setSheetsStatus('Loading…');

  try {
    await ensureToken();
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: currentSpreadsheetId,
      range: `'${currentSheetName}'!A1:B1000`,
    });
    const rows = res.result.values || [];
    if (rows.length < 2) { setSheetsStatus('Tab is empty — nothing to load.', true); return; }

    const state = {};
    for (let i = 1; i < rows.length; i++) {
      const [k, v] = rows[i];
      if (!k) continue;
      try { state[k] = JSON.parse(v); } catch { state[k] = v; }
    }

    applyAppState(state);
    clearDirty();
    setSheetsStatus(`Loaded "${currentSheetName}".`);
  } catch (e) {
    setSheetsStatus('Load failed: ' + (e.result?.error?.message || e.message), true);
  }
}

// ── Rename tab + save ─────────────────────────────────────────────────────────
async function renameCurrentTab() {
  const newName = document.getElementById('sheets-tab-name')?.value.trim();
  if (!newName || !currentSpreadsheetId || !currentSheetName) return;

  setSheetsStatus('Saving…');
  try {
    await ensureToken();

    // 1. Save current app state into the (still-old-named) tab
    const state = getAppState();
    const rows  = [['key', 'value']];
    for (const [k, v] of Object.entries(state)) {
      rows.push([k, typeof v === 'string' ? v : JSON.stringify(v)]);
    }
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: currentSpreadsheetId,
      range: `'${currentSheetName}'!A1`,
      valueInputOption: 'RAW',
      resource: { values: rows },
    });
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: currentSpreadsheetId,
      range: `'${currentSheetName}'!A${rows.length + 1}:B1000`,
    });

    // 2. Rename the tab (skip if name unchanged)
    if (newName !== currentSheetName) {
      setSheetsStatus('Renaming…');
      const meta = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: currentSpreadsheetId,
        fields: 'sheets/properties',
      });
      const sheet = meta.result.sheets.find(s => s.properties.title === currentSheetName);
      if (!sheet) { setSheetsStatus('Tab not found.', true); return; }

      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: currentSpreadsheetId,
        resource: { requests: [{ updateSheetProperties: {
          properties: { sheetId: sheet.properties.sheetId, title: newName },
          fields: 'title',
        }}]},
      });

      for (const selId of ['sheets-tab-select', 'header-trip-select']) {
        const sel = document.getElementById(selId);
        if (sel) {
          const opt = [...sel.options].find(o => o.value === currentSheetName);
          if (opt) { opt.value = newName; opt.textContent = newName; sel.value = newName; }
        }
      }
    }

    currentSheetName = newName;
    localStorage.setItem('sheets_tab_name', newName);
    setTripNameDisplay(newName);
    closeTripNameEdit();
    clearDirty();
    setSheetsStatus(`Saved & renamed to "${newName}".`);
  } catch (e) {
    setSheetsStatus('Failed: ' + (e.result?.error?.message || e.message), true);
  }
}

// ── Delete tab ────────────────────────────────────────────────────────────────
function openDeleteTripModal() {
  const modal = document.getElementById('delete-trip-modal');
  if (!modal) return;
  document.getElementById('delete-trip-name').textContent = currentSheetName || 'this trip';
  modal.hidden = false;
}

function closeDeleteTripModal() {
  const modal = document.getElementById('delete-trip-modal');
  if (modal) modal.hidden = true;
}

async function deleteCurrentTab() {
  if (!currentSpreadsheetId || !currentSheetName) return;
  closeDeleteTripModal();
  setSheetsStatus('Deleting…');

  try {
    await ensureToken();

    // Get the sheet id
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: currentSpreadsheetId,
      fields: 'sheets/properties',
    });
    const sheet = meta.result.sheets.find(s => s.properties.title === currentSheetName);
    if (!sheet) { setSheetsStatus('Tab not found.', true); return; }

    // Must have at least one sheet remaining — add a blank one first if this is the last
    if (meta.result.sheets.length === 1) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: currentSpreadsheetId,
        resource: { requests: [{ addSheet: { properties: { title: 'New Trip' } } }] },
      });
    }

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: currentSpreadsheetId,
      resource: { requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId } }] },
    });

    // Remove from both selects
    for (const selId of ['sheets-tab-select', 'header-trip-select']) {
      const sel = document.getElementById(selId);
      if (sel) {
        const opt = [...sel.options].find(o => o.value === currentSheetName);
        if (opt) opt.remove();
      }
    }

    clearDirty();
    localStorage.removeItem('sheets_tab_name');

    // Reload tab list to pick a new default
    await loadSheetTabs();
    setSheetsStatus('Trip deleted.');
  } catch (e) {
    setSheetsStatus('Delete failed: ' + (e.result?.error?.message || e.message), true);
  }
}

// ── New trip modal ────────────────────────────────────────────────────────────
function ntDefaultName() {
  const start    = document.getElementById('nt-start')?.value;
  const end      = document.getElementById('nt-end')?.value;
  const resortEl = document.getElementById('nt-resort');
  const resort   = resortEl?.options[resortEl.selectedIndex]?.text;
  const parts    = [];
  if (start && end) {
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    parts.push(`${fmt(start)} – ${fmt(end)}`);
  }
  if (resort && resort !== 'Off-site / Day Guest') {
    parts.push(resort.replace(/ Resort.*$/, '').replace(/ Hotel.*$/, '').trim());
  }
  return parts.join(' · ') || 'New Trip';
}

function syncNtName() {
  const nameEl = document.getElementById('nt-name');
  if (nameEl && !nameEl.dataset.userEdited) nameEl.value = ntDefaultName();
}

function openNewTripModal() {
  const modal = document.getElementById('new-trip-modal');
  if (!modal) return;

  // Populate resort select from app's RESORT_GROUPS
  const resortEl = document.getElementById('nt-resort');
  if (resortEl && typeof resortSelectHtml === 'function') {
    resortEl.innerHTML = resortSelectHtml('');
  }

  // Pre-fill from current app state
  const state = typeof getAppState === 'function' ? getAppState() : {};
  if (state.startDate) document.getElementById('nt-start').value = state.startDate;
  if (state.endDate)   document.getElementById('nt-end').value   = state.endDate;
  if (state.travelers) document.getElementById('nt-travelers').value = state.travelers;

  // Reset name auto-fill
  const nameEl = document.getElementById('nt-name');
  if (nameEl) { nameEl.value = ntDefaultName(); delete nameEl.dataset.userEdited; }

  modal.hidden = false;
  document.getElementById('nt-start')?.focus();
}

function closeNewTripModal() {
  const modal = document.getElementById('new-trip-modal');
  if (modal) modal.hidden = true;
}

async function createNewTab() {
  if (!currentSpreadsheetId) return;
  const newName    = document.getElementById('nt-name')?.value.trim() || ntDefaultName();
  const startDate  = document.getElementById('nt-start')?.value;
  const endDate    = document.getElementById('nt-end')?.value;
  const resortEl   = document.getElementById('nt-resort');
  const resortName = resortEl?.options[resortEl.selectedIndex]?.text || '';
  const travelers  = parseInt(document.getElementById('nt-travelers')?.value) || 1;

  closeNewTripModal();
  setSheetsStatus('Creating trip…');

  try {
    await ensureToken();
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: currentSpreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: newName } } }] },
    });

    for (const selId of ['sheets-tab-select', 'header-trip-select']) {
      const sel = document.getElementById(selId);
      if (sel) {
        const opt = document.createElement('option');
        opt.value = newName; opt.textContent = newName;
        sel.appendChild(opt);
        sel.value = newName;
      }
    }

    currentSheetName = newName;
    localStorage.setItem('sheets_tab_name', newName);

    // Apply starter state to the app
    if (typeof applyAppState === 'function') {
      const starterHotel = (resortName && resortName !== 'Off-site / Day Guest')
        ? [{ id: 1, resort: resortName, checkIn: startDate, checkOut: endDate, ratePerNight: 0 }]
        : [];
      applyAppState({ startDate, endDate, travelers, hotels: starterHotel });
    }

    const nameInput = document.getElementById('sheets-tab-name');
    if (nameInput) { nameInput.value = newName; nameInput.dataset.userEdited = 'true'; }
    setTripNameDisplay(newName);
    closeTripNameEdit();
    setSaveLoadEnabled(true);
    setSheetsStatus(`Created “${newName}”.`);
  } catch (e) {
    setSheetsStatus('Create failed: ' + (e.result?.error?.message || e.message), true);
  }
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
function initSheetsUI() {
  const toggleBtn = document.getElementById('sheets-toggle-btn');
  const panel     = document.getElementById('sheets-panel');

  toggleBtn?.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleBtn.classList.toggle('active', !panel.hidden);
  });

  document.getElementById('google-auth-btn')?.addEventListener('click', () => {
    if (signedIn) {
      toggleUserMenu();
    } else {
      signIn();
    }
  });


  document.getElementById('google-signout-btn')?.addEventListener('click', () => {
    signOut();
  });

  // Close user menu when clicking elsewhere
  document.addEventListener('click', e => {
    if (!e.target.closest('#google-auth-area')) closeUserMenu();
  });

  document.getElementById('sheets-save-btn')?.addEventListener('click', saveToSheet);
  document.getElementById('sheets-load-btn')?.addEventListener('click', loadFromSheet);
  document.getElementById('sheets-rename-btn')?.addEventListener('click', renameCurrentTab);
  document.getElementById('sheets-new-tab-btn')?.addEventListener('click', () => {
    if (!currentSpreadsheetId) return;
    openNewTripModal();
  });
  document.getElementById('nt-cancel-btn')?.addEventListener('click', closeNewTripModal);
  document.getElementById('nt-create-btn')?.addEventListener('click', createNewTab);

  // Close modal on backdrop click
  document.getElementById('new-trip-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNewTripModal();
  });

  // Auto-update trip name as modal fields change
  ['nt-start', 'nt-end', 'nt-resort'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', syncNtName);
  });
  document.getElementById('nt-name')?.addEventListener('input', e => {
    e.target.dataset.userEdited = e.target.value ? 'true' : '';
  });

  function doTripSwitch(value) {
    currentSheetName = value;
    localStorage.setItem('sheets_tab_name', value);
    const sel1 = document.getElementById('sheets-tab-select');
    const sel2 = document.getElementById('header-trip-select');
    if (sel1) sel1.value = value;
    if (sel2) sel2.value = value;
    const nameInput = document.getElementById('sheets-tab-name');
    if (nameInput) { nameInput.value = value; nameInput.dataset.userEdited = 'true'; }
    setTripNameDisplay(value);
    closeTripNameEdit();
    clearDirty();
    loadFromSheet();
  }

  function onTripSelectChange(value) {
    if (value === currentSheetName) return;
    const previousValue = currentSheetName;

    if (stateDirty) {
      // Revert the select visually while the user decides
      const sel1 = document.getElementById('sheets-tab-select');
      const sel2 = document.getElementById('header-trip-select');
      if (sel1) sel1.value = previousValue;
      if (sel2) sel2.value = previousValue;

      showUnsavedBanner(
        async () => { await saveToSheet(); doTripSwitch(value); },
        ()       => { doTripSwitch(value); },
      );
    } else {
      doTripSwitch(value);
    }
  }

  document.getElementById('sheets-tab-select')?.addEventListener('change', e => onTripSelectChange(e.target.value));
  document.getElementById('header-trip-select')?.addEventListener('change', e => onTripSelectChange(e.target.value));

  document.getElementById('trip-name-edit-btn')?.addEventListener('click', openTripNameEdit);
  document.getElementById('trip-name-cancel-btn')?.addEventListener('click', closeTripNameEdit);
  document.getElementById('trip-delete-btn')?.addEventListener('click', openDeleteTripModal);
  document.getElementById('dt-cancel-btn')?.addEventListener('click', closeDeleteTripModal);
  document.getElementById('dt-confirm-btn')?.addEventListener('click', deleteCurrentTab);
  document.getElementById('delete-trip-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDeleteTripModal();
  });

  document.getElementById('sheets-tab-name')?.addEventListener('input', e => {
    e.target.dataset.userEdited = 'true';
    const renameBtn = document.getElementById('sheets-rename-btn');
    if (renameBtn) renameBtn.disabled = e.target.value.trim() === currentSheetName;
  });
}

document.addEventListener('DOMContentLoaded', initSheetsUI);
