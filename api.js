const PARKS = [
  { name: 'Magic Kingdom',      id: '75ea578a-adc8-4116-a54d-dccb60765ef9' },
  { name: 'EPCOT',              id: '47f90d2c-e191-4239-a466-5892ef59a88b' },
  { name: 'Hollywood Studios',  id: '288747d1-8b4f-4a64-867e-ea7c9b27bad8' },
  { name: 'Animal Kingdom',     id: '1c84a229-8862-4648-9c71-378ddd2c7693' },
];

const BASE = 'https://api.themeparks.wiki/v1';

async function fetchSchedule(parkId, year, month) {
  const url = `${BASE}/entity/${parkId}/schedule/${year}/${String(month).padStart(2, '0')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'disney-planning/1.0' } });
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return res.json();
}

async function fetchLivePrices(parkId) {
  const url = `${BASE}/entity/${parkId}/schedule/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'disney-planning/1.0' } });
  if (!res.ok) throw new Error(`Live fetch failed: ${res.status}`);
  return res.json();
}

// Returns map of date string -> { park, hours, specialEvents, llsp, llmp }
async function loadPlannerData(startDate, endDate) {
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');

  // Collect unique year+month combos needed
  const months = new Set();
  const cur = new Date(start);
  while (cur <= end) {
    months.add(`${cur.getFullYear()}-${cur.getMonth() + 1}`);
    cur.setDate(cur.getDate() + 1);
  }

  const results = {}; // date -> park -> data

  await Promise.all(PARKS.map(async park => {
    const schedules = await Promise.all(
      [...months].map(m => {
        const [y, mo] = m.split('-');
        return fetchSchedule(park.id, y, mo).catch(err => ({ error: err.message, schedule: [] }));
      })
    );

    for (const payload of schedules) {
      for (const entry of payload.schedule || []) {
        const date = entry.date?.slice(0, 10);
        if (!date) continue;
        if (date < startDate || date > endDate) continue;
        if (entry.type !== 'OPERATING') continue;

        if (!results[date]) results[date] = {};
        if (!results[date][park.name]) {
          results[date][park.name] = {
            park: park.name,
            date,
            openTime: entry.openingTime,
            closeTime: entry.closingTime,
            specialEvents: [],
            llsp: [],
            llmp: [],
          };
        }

        // Special events (non-OPERATING entries on the same date)
        for (const other of payload.schedule || []) {
          if (other.date?.slice(0, 10) === date && other.type !== 'OPERATING') {
            results[date][park.name].specialEvents.push({
              type: other.type,
              name: other.name || other.type,
              openTime: other.openingTime,
              closeTime: other.closingTime,
            });
          }
        }

        // Lightning Lane Single Pass
        for (const purchase of entry.purchases || []) {
          if (purchase.type !== 'ATTRACTION') continue;
          const name = purchase.name?.replace('Lightning Lane for ', '') || 'Unknown';
          const price = purchase.price || {};
          results[date][park.name].llsp.push({
            name,
            available: Boolean(purchase.available),
            price: price.formatted || null,
            priceAmount: price.amount || null,
          });
        }

        // Lightning Lane Multi Pass
        for (const purchase of entry.purchases || []) {
          if (purchase.type !== 'MULTIPASS') continue;
          const price = purchase.price || {};
          results[date][park.name].llmp.push({
            name: purchase.name || 'Lightning Lane Multi Pass',
            available: Boolean(purchase.available),
            price: price.formatted || null,
            priceAmount: price.amount || null,
          });
        }
      }
    }
  }));

  return results;
}
