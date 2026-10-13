#!/usr/bin/env python3
"""
Scrapes Walt Disney World special event pricing and dates from mousesavers.com
and writes events-data.json.

Run manually: EVENT_URL=<url> python3 scrape-events.py
Or via GitHub Actions weekly.
"""

import difflib
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

URL = os.environ["EVENT_URL"]

MONTH_NUMS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

# Events with per-date pricing (scraped from "$X for Month D" bullet lists)
PER_DATE_EVENTS = {
    "Mickey's Not-So-Scary Halloween Party": {
        "heading": "Mickey's Not-So-Scary Halloween Party",
        "park": "Magic Kingdom",
        "requiresTicket": True,
    },
    "Mickey's Very Merry Christmas Party": {
        "heading": "Mickey's Very Merry Christmas Party",
        "park": "Magic Kingdom",
        "requiresTicket": True,
    },
    "Disney Jollywood Nights": {
        "heading": "Disney Jollywood Nights",
        "park": "Hollywood Studios",
        "requiresTicket": True,
    },
    "Disney H2O Glow After Hours": {
        "heading": "Disney H2O Glow After Hours",
        "park": "Typhoon Lagoon",
        "requiresTicket": True,
    },
}

# Events identified by date ranges in body text (no per-date pricing)
DATE_RANGE_EVENTS = [
    {"heading": "Walt Disney World Marathon Weekend",    "name": "Walt Disney World Marathon Weekend",            "park": None,              "requiresTicket": True,  "priceNote": "Registration required"},
    {"heading": "Epcot International Festival of the Arts", "name": "Epcot International Festival of the Arts", "park": "EPCOT",           "requiresTicket": False, "priceNote": "Included with Epcot admission"},
    {"heading": "Puzzlehop Hollywood Studios",           "name": "Puzzlehop Hollywood Studios",                  "park": "Hollywood Studios","requiresTicket": True,  "priceNote": "$266.25/team (up to 4)"},
    {"heading": "Disney Princess Half Marathon Weekend", "name": "Disney Princess Half Marathon Weekend",         "park": None,              "requiresTicket": True,  "priceNote": "Registration required"},
    {"heading": "Epcot International Flower and Garden Festival", "name": "Epcot International Flower & Garden Festival", "park": "EPCOT", "requiresTicket": False, "priceNote": "Included with Epcot admission"},
    {"heading": "runDisney Springtime Surprise Weekend", "name": "runDisney Springtime Surprise Weekend",         "park": None,              "requiresTicket": True,  "priceNote": "Registration required"},
    {"heading": "Epcot International Food and Wine Festival", "name": "Epcot International Food & Wine Festival","park": "EPCOT",           "requiresTicket": False, "priceNote": "Included with Epcot admission"},
    {"heading": "Disney Wine & Dine Half Marathon Weekend","name": "Disney Wine & Dine Half Marathon Weekend",   "park": None,              "requiresTicket": True,  "priceNote": "Registration required"},
    {"heading": "Epcot International Festival of the Holidays", "name": "Epcot International Festival of the Holidays", "park": "EPCOT",  "requiresTicket": False, "priceNote": "Included with Epcot admission"},
]


# Concert series whose section has an <li> lineup ("March 5-7: The Music of ABBA").
# One calendar entry per night, named "<series>: <act>". Year comes from the page
# text, so next season's lineup is picked up automatically once the page updates.
LINEUP_EVENTS = [
    {"heading": "Eat to the Beat Concerts",          "series": "Eat to the Beat",   "park": "EPCOT", "requiresTicket": False, "priceNote": "Included with Epcot admission"},
    {"heading": "Garden Rocks Concerts",             "series": "Garden Rocks",      "park": "EPCOT", "requiresTicket": False, "priceNote": "Included with Epcot admission"},
    {"heading": "Candlelight Processional",          "series": "Candlelight Processional", "park": "EPCOT", "requiresTicket": False, "priceNote": "Included with Epcot admission (dining package optional)",
     "narrators": True, "fallback_range": True},
    {"heading": "Disney on Broadway Concert Series", "series": "Disney on Broadway","park": "EPCOT", "requiresTicket": False, "priceNote": "Included with Epcot admission"},
]

# Other sections whose text states a range with the year ("The 2026 Events Invitational will be held November 23-27")
DATE_RANGE_EVENTS += [
    {"heading": "ESPN Events Invitational",   "name": "ESPN Events Invitational",         "park": None,               "requiresTicket": False, "priceNote": "At ESPN Wide World of Sports"},
]

# Single dated days ("In 2027, Easter Sunday will be March 28")
SINGLE_DATE_EVENTS = [
    {"heading": "Easter",        "name": "Easter Sunday", "park": None},
    {"heading": "Mardi Gras",    "name": "Mardi Gras",    "park": None},
    {"heading": "Thanksgiving",  "name": "Thanksgiving",  "park": None},
    {"heading": "Mother",        "name": "Mother's Day",  "park": None},
]

# Annual observances whose section has no year (or only "the month of April"). The section must
# still exist on the page (warn if not); dates are generated for this year and next.
# "days": None means the whole month, with the month read from "the month of <Month>".
# (Deliberately skipped: Christmas at MK/AK/HS, Holidays at Disney Springs, Holiday Sleigh Rides —
# month-long décor/entertainment that only added daily clutter — and Gay Days, which isn't Disney-sponsored.)
FIXED_EVENTS = [
    {"heading": "Independence Day",        "name": "Independence Day fireworks", "park": "Magic Kingdom", "month": 7,  "days": [3, 4]},
    {"heading": "Bastille Day",            "name": "Bastille Day",              "park": "EPCOT",         "month": 7,  "days": [14]},
    {"heading": "Cinco de Mayo",           "name": "Cinco de Mayo",             "park": "EPCOT",         "month": 5,  "days": [5]},
    {"heading": "Christmas Eve",           "name": "Christmas Eve",             "park": None,            "month": 12, "days": [24]},
    {"heading": "Christmas Eve",           "name": "Christmas Day",             "park": None,            "month": 12, "days": [25]},
    {"heading": "New Years Eve",    "name": "New Year's Eve",            "park": None,            "month": 12, "days": [31]},
    {"heading": "New Years Day",    "name": "New Year's Day",            "park": None,            "month": 1,  "days": [1]},
    {"heading": "Earth Month",             "name": "Earth Month Celebration",   "park": "Animal Kingdom","month": None, "days": None},
]

PAST_GRACE_DAYS = 60  # keep recently-finished events (a trip you just took still shows them)

MIN_EVENTS = 8  # a healthy scrape yields ~11; far fewer means the page layout changed


def warn(msg):
    print(f"  WARN: {msg}", file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::warning::{msg}")


def month_number(word):
    """'May' -> 5; tolerates the page's typos ('Mary 5-7' -> 5)."""
    w = word.lower()
    if w in MONTH_NUMS:
        return MONTH_NUMS[w]
    close = difflib.get_close_matches(w, MONTH_NUMS, n=1, cutoff=0.8)
    return MONTH_NUMS[close[0]] if close else None


LINEUP_RE = re.compile(
    r"^([A-Za-z]+)\s+(\d+)(?:\s*-\s*(?:([A-Za-z]+)\s+)?(\d+))?\s*:\s*(.+)$"
)


def parse_lineup_item(line, year=None):
    """'March 5-7: The Music of ABBA' / 'May 31-June 1: X' / 'November 1: X'
    -> (['2026-03-05', ...], 'The Music of ABBA'), or None if the line isn't a lineup entry."""
    m = LINEUP_RE.match(line)
    if not m:
        return None
    m1 = month_number(m.group(1))
    if not m1:
        return None
    d1 = int(m.group(2))
    m2 = month_number(m.group(3)) if m.group(3) else m1
    d2 = int(m.group(4)) if m.group(4) else d1
    if not m2:
        return None
    y1 = year or guess_year(m1)
    y2 = y1 + 1 if m2 < m1 else y1
    try:
        dates = expand_date_range(datetime(y1, m1, d1), datetime(y2, m2, d2))
    except ValueError:
        return None
    return dates, m.group(5).strip()


def parse_single_date(text, year=None):
    """'In 2027, Easter Sunday will be March 28.' -> ['2027-03-28']"""
    m = re.search(r"will be\s+([A-Za-z]+\s+\d+)", text)
    return parse_date_phrase(m.group(1), year) if m else []


def month_of(text):
    """'Throughout the month of April, ...' -> 4"""
    m = re.search(r"month of ([A-Za-z]+)", text, re.IGNORECASE)
    return MONTH_NUMS.get(m.group(1).lower()) if m else None


def fixed_dates(month, days, years):
    """Dates for an annual observance in each year; days=None means the whole month."""
    out = []
    for y in years:
        if days is None:
            first = datetime(y, month, 1)
            nxt = datetime(y + (month == 12), month % 12 + 1, 1)
            out += expand_date_range(first, nxt - timedelta(days=1))
        else:
            out += [datetime(y, month, d).strftime("%Y-%m-%d") for d in days]
    return out


def lineup_name(series, act, narrators=False):
    """'Eat to the Beat' + 'Hanson' -> 'Eat to the Beat: Hanson'; unannounced narrators read 'Narrator TBA'."""
    if narrators and act.strip().upper() in ("TBA", "TBD"):
        return f"{series}: Narrator TBA"
    return f"{series}: {act}"


def prune_past(data, today=None, grace_days=PAST_GRACE_DAYS):
    """Drop dates older than `grace_days` before today from byDate and events[]; drop emptied events."""
    cutoff = ((today or datetime.today()) - timedelta(days=grace_days)).strftime("%Y-%m-%d")
    data["byDate"] = {d: v for d, v in data["byDate"].items() if d >= cutoff}
    kept = []
    for ev in data["events"]:
        ev["dates"] = [x for x in ev["dates"] if x["date"] >= cutoff]
        if ev["dates"]:
            kept.append(ev)
    data["events"] = kept
    return data


def fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": "disney-planning-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")


def decode_entities(s):
    return (s
        .replace("&#8211;", "-").replace("&#8212;", "-")
        .replace("&#8217;", "'").replace("&#8216;", "'")
        .replace("&#8220;", '"').replace("&#8221;", '"')
        .replace("&amp;", "&").replace("&nbsp;", " ")
        .replace("–", "-").replace("—", "-")
    )


def clean(s):
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", decode_entities(s)).strip()


def guess_year(month_num):
    today = datetime.today()
    return today.year + 1 if month_num < today.month else today.year


def section_year(text):
    """The page states the season's year ('In 2027, ...' / 'The 2026 ...'); use it
    rather than guessing from today's month, which mis-dates in-progress and past events."""
    m = re.search(r"\b(20\d{2})\b", text)
    return int(m.group(1)) if m else None


def expand_date_range(start_dt, end_dt):
    dates, cur = [], start_dt
    while cur <= end_dt:
        dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    return dates


def parse_date_phrase(phrase, year=None):
    """'August 11, 14; September 1' -> ['2026-08-11', '2026-08-14', '2026-09-01']"""
    dates = []
    prev_month = 0
    for group in re.split(r"[;,]\s*(?=[A-Za-z])", phrase):
        group = group.strip()
        m = re.match(r"([A-Za-z]+)\s+((?:\d+|,|\s+|and\b)+)", group)
        if not m:
            continue
        month_num = MONTH_NUMS.get(m.group(1).lower())
        if not month_num:
            continue
        # A list that runs 'November ...; December ...; January 3' crosses New Year
        if year and month_num < prev_month:
            year += 1
        prev_month = month_num
        yr = year or guess_year(month_num)
        for day in re.findall(r"\d+", m.group(2)):
            try:
                dates.append(datetime(yr, month_num, int(day)).strftime("%Y-%m-%d"))
            except ValueError:
                pass
    return dates


def extract_date_range(text, year=None):
    """Extract a continuous date range from text, returns list of YYYY-MM-DD strings."""
    # Cross-month: 'Month D - Month D' or 'Month D through Month D'
    m = re.search(
        r"([A-Za-z]+)\s+(\d+)\s*(?:-|through)\s*([A-Za-z]+)\s+(\d+)",
        text, re.IGNORECASE
    )
    if m:
        m1 = MONTH_NUMS.get(m.group(1).lower())
        m2 = MONTH_NUMS.get(m.group(3).lower())
        if m1 and m2:
            y1 = year or guess_year(m1)
            # If end month is earlier than start month, end is next year
            y2 = y1 + 1 if m2 < m1 else y1
            try:
                return expand_date_range(
                    datetime(y1, m1, int(m.group(2))),
                    datetime(y2, m2, int(m.group(4)))
                )
            except ValueError:
                pass

    # Same-month: 'Month D-D'
    m = re.search(r"([A-Za-z]+)\s+(\d+)-(\d+)", text, re.IGNORECASE)
    if m:
        month_num = MONTH_NUMS.get(m.group(1).lower())
        if month_num:
            yr = year or guess_year(month_num)
            try:
                return expand_date_range(
                    datetime(yr, month_num, int(m.group(2))),
                    datetime(yr, month_num, int(m.group(3)))
                )
            except ValueError:
                pass
    return []


def parse_price(s):
    m = re.search(r"\$\s*([\d,]+\.?\d*)", s)
    return float(m.group(1).replace(",", "")) if m else None


def parse_price_line(line, year=None):
    """'$126.74 (age 10+), $116.09 (age 3-9) for August 11, 14' -> {priceAdult, priceChild, dates}"""
    parts = re.split(r"\s+for\s+", line, maxsplit=1)
    if len(parts) != 2:
        return None
    price_part, date_part = parts
    price_adult = price_child = None
    # Each price may carry an "(age ...)" label; the page sometimes omits the label on
    # the second price ("$206.61 (age 10+), $195.96 for ..."), which is then the child price.
    for m in re.finditer(r"\$\s*([\d,]+\.?\d*)\s*(?:\(([^)]*)\))?", price_part):
        price = float(m.group(1).replace(",", ""))
        label = (m.group(2) or "").lower()
        if not label:
            if price_adult is None:
                price_adult = price
            elif price_child is None:
                price_child = price
        elif "10" in label or "adult" in label:
            price_adult = price
        elif "3" in label and "up" in label:
            price_adult = price_child = price
        else:
            price_child = price
    if price_adult is None:
        return None
    dates = parse_date_phrase(date_part.strip(), year)
    return {"priceAdult": price_adult, "priceChild": price_child, "dates": dates} if dates else None


# Page sections we've decided NOT to scrape (substring match, apostrophes ignored). Anything else on
# the page that no list above recognises is reported as "new on the page" after each scrape.
IGNORED_HEADINGS = [
    "walt disney world special events",  # page title
    "overview", "dining package", "valentines day", "chinese new year",
    "christmas at magic kingdom", "christmas at animal kingdom", "christmas at hollywood studios",
    "holidays at disney springs", "holiday sleigh rides", "gay days",
]


def _norm(text):
    return re.sub(r"[\u2019']", "", text.lower())


def unrecognized_headings(headings):
    """Headings that no scraper list handles and that aren't deliberately ignored."""
    known = [_norm(h) for h in (
        [m["heading"] for m in PER_DATE_EVENTS.values()]
        + [e["heading"] for e in DATE_RANGE_EVENTS + SINGLE_DATE_EVENTS + FIXED_EVENTS + LINEUP_EVENTS]
        + IGNORED_HEADINGS
    )]
    return [h for h in headings if not any(k in _norm(h) for k in known)]


def diff_events(old, new, today=None):
    """Compare two events-data dicts. Returns (markdown, notable); notable = new/removed events
    (worth an issue). Dates older than the prune cutoff are ignored so ageing out isn't a 'change'."""
    import copy
    old = prune_past(copy.deepcopy(old), today)
    new = prune_past(copy.deepcopy(new), today)

    def index(d):
        return {(date, e["name"]): e for date, evs in d["byDate"].items() for e in evs}

    o, n = index(old), index(new)
    old_names = {k[1] for k in o}
    new_names = {k[1] for k in n}
    lines = []

    added = sorted(new_names - old_names)
    removed = sorted(old_names - new_names)
    for name in added:
        ds = sorted(k[0] for k in n if k[1] == name)
        lines.append(f"- **New:** {name} ({len(ds)} dates, {ds[0]} to {ds[-1]})")
    for name in removed:
        ds = sorted(k[0] for k in o if k[1] == name)
        lines.append(f"- **No longer listed:** {name} (was {len(ds)} dates, {ds[0]} to {ds[-1]})")

    for name in sorted(old_names & new_names):
        plus  = sorted(k[0] for k in n if k[1] == name and k not in o)
        minus = sorted(k[0] for k in o if k[1] == name and k not in n)
        changed = sorted(k[0] for k in n if k[1] == name and k in o and n[k] != o[k])
        parts = []
        if plus:    parts.append(f"{len(plus)} dates added ({plus[0]} to {plus[-1]})")
        if minus:   parts.append(f"{len(minus)} dates removed ({minus[0]} to {minus[-1]})")
        if changed: parts.append(f"{len(changed)} dates changed price/details ({changed[0]} to {changed[-1]})")
        if parts:
            lines.append(f"- {name}: " + "; ".join(parts))

    return "\n".join(lines), bool(added or removed)


def build_report(old, new, unknown, today=None):
    """Markdown change report + whether it's worth an alert.

    Alert-worthy ("notable") only when an event we actually publish is added or removed — the diff is
    on the parsed data, so reworded page text can't trigger it. Unrecognised page sections are listed
    for information but never trigger an alert on their own."""
    stamp = (today or datetime.today()).strftime("%Y-%m-%d")
    out = [f"## Events data changes ({stamp})", ""]
    notable = False
    if old is None:
        out.append("No previous published data to compare against.")
    else:
        body, notable = diff_events(old, new, today)
        out.append(body or "No changes since the last scrape.")
    if unknown:
        out += ["", "### FYI: sections on the page the scraper doesn't handle (no alert)", ""]
        out += [f"- {h}" for h in unknown]
        out += ["", "Add them to the scraper, or to `IGNORED_HEADINGS` if they don't belong on the calendar."]
    return "\n".join(out) + "\n", notable


def get_sections(html):
    """Return dict of heading_text -> body_text for all h2/h3 sections."""
    sections = {}
    for heading_raw, body_raw in re.findall(
        r"<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[23]|$)", html, re.DOTALL
    ):
        h = clean(heading_raw)
        b = clean(body_raw)
        if h:
            sections[h] = b
    return sections


def find_section(sections, heading_substr):
    """Find a section whose heading contains heading_substr (case-insensitive)."""
    norm = lambda t: re.sub(r"[\u2019']", "", t.lower())  # curly vs straight apostrophes
    hl = norm(heading_substr)
    for h, b in sections.items():
        if hl in norm(h):
            return h, b
    return None, None


def scrape():
    print(f"Fetching {URL} ...", file=sys.stderr)
    html = fetch_html(URL)
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
    html = re.sub(r"<style[^>]*>.*?</style>",   "", html, flags=re.DOTALL)

    sections = get_sections(html)

    events_by_date = {}
    raw_events = []

    def add_to_index(date, entry):
        events_by_date.setdefault(date, []).append(entry)

    # ── Per-date events (price varies by date) ────────────────────────────────
    for name, meta in PER_DATE_EVENTS.items():
        _, body = find_section(sections, meta["heading"])
        if not body:
            warn(f"no section for '{name}'")
            continue

        # We need li items from this specific section — re-extract from raw html
        raw_section = ""
        for heading_raw, body_raw in re.findall(
            r"<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[23]|$)", html, re.DOTALL
        ):
            if meta["heading"].lower() in clean(heading_raw).lower():
                raw_section = body_raw
                break

        year = section_year(body)
        price_entries = []
        for item in re.findall(r"<li>(.*?)</li>", raw_section, re.DOTALL):
            line = clean(item)
            if "$" in line and " for " in line.lower():
                parsed = parse_price_line(line, year)
                if parsed:
                    price_entries.append(parsed)

        # Fall back: parse discrete dates from body text if no price lines
        if not price_entries:
            # Extract date list from body like "will be offered on August 7, 11, ... and 31"
            m = re.search(r"(?:offered|held)\s+(?:on\s+)?(.+?)(?:\.|$)", body, re.IGNORECASE)
            if m:
                dates = parse_date_phrase(m.group(1), year)
                if dates:
                    for date in dates:
                        entry = {
                            "name": name, "park": meta["park"],
                            "requiresTicket": meta["requiresTicket"],
                            "priceAdult": None, "priceChild": None, "priceNote": "Pricing TBD",
                        }
                        add_to_index(date, entry)
                    raw_events.append({
                        "name": name, "park": meta["park"],
                        "requiresTicket": meta["requiresTicket"],
                        "perDatePricing": False,
                        "dates": [{"date": d} for d in sorted(dates)],
                    })
                    print(f"  {name}: {len(dates)} dates (no pricing yet)", file=sys.stderr)
            else:
                warn(f"no dates/prices for '{name}'")
            continue

        event_dates = []
        for entry in price_entries:
            for date in entry["dates"]:
                event_dates.append({"date": date, "priceAdult": entry["priceAdult"], "priceChild": entry["priceChild"]})
                add_to_index(date, {
                    "name": name, "park": meta["park"],
                    "requiresTicket": meta["requiresTicket"],
                    "priceAdult": entry["priceAdult"],
                    "priceChild": entry["priceChild"],
                    "priceNote": None,
                })

        if event_dates:
            raw_events.append({
                "name": name, "park": meta["park"],
                "requiresTicket": meta["requiresTicket"],
                "perDatePricing": True,
                "dates": sorted(event_dates, key=lambda x: x["date"]),
            })
            print(f"  {name}: {len(event_dates)} dated prices", file=sys.stderr)

    # ── Date-range events ─────────────────────────────────────────────────────
    for ev in DATE_RANGE_EVENTS:
        _, body = find_section(sections, ev["heading"])
        if not body:
            warn(f"no section for '{ev['heading']}'")
            continue

        year = section_year(body)
        dates = extract_date_range(body, year)
        if not dates:
            # Try parsing discrete dates (e.g. Puzzlehop "will take place on October 17")
            m = re.search(r"(?:took place|will take place|take place|held|will be held)\s+(?:on\s+)?([A-Za-z]+ \d+)", body, re.IGNORECASE)
            if m:
                dates = parse_date_phrase(m.group(1), year)

        if not dates:
            warn(f"no dates for '{ev['heading']}': {body[:120]}")
            continue

        print(f"  {ev['name']}: {len(dates)} dates ({dates[0]} – {dates[-1]})", file=sys.stderr)

        for date in dates:
            add_to_index(date, {
                "name": ev["name"], "park": ev["park"],
                "requiresTicket": ev["requiresTicket"],
                "priceAdult": None, "priceChild": None,
                "priceNote": ev["priceNote"],
            })

        raw_events.append({
            "name": ev["name"], "park": ev["park"],
            "requiresTicket": ev["requiresTicket"],
            "perDatePricing": False,
            "priceNote": ev["priceNote"],
            "dates": [{"date": d} for d in dates],
        })

    def add_simple(name, park, requires_ticket, price_note, dates):
        for date in dates:
            add_to_index(date, {
                "name": name, "park": park, "requiresTicket": requires_ticket,
                "priceAdult": None, "priceChild": None, "priceNote": price_note,
            })
        raw_events.append({
            "name": name, "park": park, "requiresTicket": requires_ticket,
            "perDatePricing": False, "priceNote": price_note,
            "dates": [{"date": d} for d in dates],
        })
        print(f"  {name}: {len(dates)} dates ({dates[0]} – {dates[-1]})", file=sys.stderr)

    # ── Single dated days ─────────────────────────────────────────────────────
    for ev in SINGLE_DATE_EVENTS:
        _, body = find_section(sections, ev["heading"])
        dates = parse_single_date(body, section_year(body)) if body else []
        if not dates:
            warn(f"no date found for '{ev['name']}'")
            continue
        add_simple(ev["name"], ev["park"], False, None, dates)

    # ── Annual observances (fixed month/day, or a whole month) ────────────────
    this_year = datetime.today().year
    for ev in FIXED_EVENTS:
        _, body = find_section(sections, ev["heading"])
        if not body:
            warn(f"no section for '{ev['heading']}'")
            continue
        month = ev["month"] or month_of(body)
        if not month:
            warn(f"no month found for '{ev['name']}'")
            continue
        add_simple(ev["name"], ev["park"], False, None,
                   fixed_dates(month, ev["days"], [this_year, this_year + 1]))

    # ── Concert lineups (one act per night) ───────────────────────────────────
    for ev in LINEUP_EVENTS:
        _, body = find_section(sections, ev["heading"])
        if not body:
            warn(f"no section for '{ev['heading']}'")
            continue
        raw_section = next(
            (b for h, b in re.findall(r"<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[23]|$)", html, re.DOTALL)
             if ev["heading"].lower() in clean(h).lower()), "")
        year = section_year(body)
        lineup = []
        for item in re.findall(r"<li[^>]*>(.*?)</li>", raw_section, re.DOTALL):
            parsed = parse_lineup_item(clean(item), year)
            if parsed:
                lineup.append(parsed)
        if not lineup:
            warn(f"no lineup found for '{ev['heading']}'")
            dates = extract_date_range(body, year) if ev.get("fallback_range") else []
            if dates:  # still show the event itself, without per-night names
                add_simple(ev["series"], ev["park"], ev["requiresTicket"], ev["priceNote"], dates)
            continue

        event_dates = []
        for dates, act in lineup:
            for date in dates:
                event_dates.append({"date": date, "act": act})
                add_to_index(date, {
                    "name": lineup_name(ev["series"], act, ev.get("narrators", False)), "park": ev["park"],
                    "requiresTicket": ev["requiresTicket"],
                    "priceAdult": None, "priceChild": None,
                    "priceNote": ev["priceNote"],
                })
        raw_events.append({
            "name": ev["series"], "park": ev["park"],
            "requiresTicket": ev["requiresTicket"],
            "perDatePricing": False,
            "priceNote": ev["priceNote"],
            "dates": sorted(event_dates, key=lambda x: x["date"]),
        })
        print(f"  {ev['series']}: {len(event_dates)} nights ({event_dates[0]['date']} – {event_dates[-1]['date']})", file=sys.stderr)

    unknown = unrecognized_headings(list(sections))
    for h in unknown:
        warn(f"unrecognised section on page: '{h}'")

    output = {
        "scrapedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": URL,
        "byDate": events_by_date,
        "events": raw_events,
    }
    output["_unrecognized"] = unknown  # popped by main(); not published
    return output


if __name__ == "__main__":
    data = scrape()
    unknown = data.pop("_unrecognized", [])
    if len(data["events"]) < MIN_EVENTS:
        # Fail before writing so the workflow stops and the last good data branch stays published
        sys.exit(f"ERROR: only {len(data['events'])} events scraped (< {MIN_EVENTS}); page layout likely changed")
    data = prune_past(data)

    # Compare with the previously published file (OLD_EVENTS=path) and write a report for the workflow
    old = None
    old_path = os.environ.get("OLD_EVENTS")
    if old_path and os.path.exists(old_path):
        try:
            with open(old_path) as f:
                old = json.load(f)
        except (OSError, ValueError) as e:
            warn(f"could not read previous data at {old_path}: {e}")
    report, notable = build_report(old, data, unknown)
    with open("scrape-report.md", "w") as f:
        f.write(report)
    if notable:
        open("scrape-notable.flag", "w").close()
    print(report, file=sys.stderr)

    with open("events-data.json", "w") as f:
        json.dump(data, f, indent=2)
    total_dates = sum(len(e["dates"]) for e in data["events"])
    print(f"Wrote events-data.json: {len(data['events'])} events, {total_dates} date entries", file=sys.stderr)
