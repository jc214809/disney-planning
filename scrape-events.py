#!/usr/bin/env python3
"""
Scrapes Walt Disney World special event pricing and dates from mousesavers.com
and writes events-data.json.

Run manually: EVENT_URL=<url> python3 scrape-events.py
Or via GitHub Actions weekly.
"""

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
    {"heading": "Candlelight Processional",              "name": "Candlelight Processional",                     "park": "EPCOT",           "requiresTicket": False, "priceNote": "Included with Epcot admission (dining package optional)"},
]


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


def expand_date_range(start_dt, end_dt):
    dates, cur = [], start_dt
    while cur <= end_dt:
        dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    return dates


def parse_date_phrase(phrase):
    """'August 11, 14; September 1' -> ['2026-08-11', '2026-08-14', '2026-09-01']"""
    dates = []
    for group in re.split(r"[;,]\s*(?=[A-Za-z])", phrase):
        group = group.strip()
        m = re.match(r"([A-Za-z]+)\s+([\d,\s]+)", group)
        if not m:
            continue
        month_num = MONTH_NUMS.get(m.group(1).lower())
        if not month_num:
            continue
        year = guess_year(month_num)
        for day in re.findall(r"\d+", m.group(2)):
            try:
                dates.append(datetime(year, month_num, int(day)).strftime("%Y-%m-%d"))
            except ValueError:
                pass
    return dates


def extract_date_range(text):
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
            y1 = guess_year(m1)
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
            year = guess_year(month_num)
            try:
                return expand_date_range(
                    datetime(year, month_num, int(m.group(2))),
                    datetime(year, month_num, int(m.group(3)))
                )
            except ValueError:
                pass
    return []


def parse_price(s):
    m = re.search(r"\$\s*([\d,]+\.?\d*)", s)
    return float(m.group(1).replace(",", "")) if m else None


def parse_price_line(line):
    """'$126.74 (age 10+), $116.09 (age 3-9) for August 11, 14' -> {priceAdult, priceChild, dates}"""
    parts = re.split(r"\s+for\s+", line, maxsplit=1)
    if len(parts) != 2:
        return None
    price_part, date_part = parts
    pairs = re.findall(r"\$\s*[\d,]+\.?\d*\s*\([^)]+\)", price_part)
    price_adult = price_child = None
    for pair in pairs:
        price = parse_price(pair)
        age_m = re.search(r"\(age\s+([^)]+)\)", pair, re.IGNORECASE)
        if not age_m:
            price_adult = price_child = price
            continue
        age_text = age_m.group(1).lower()
        if "10" in age_text or "adult" in age_text:
            price_adult = price
        elif "3" in age_text and "up" in age_text:
            price_adult = price_child = price
        else:
            price_child = price
    if price_adult is None:
        return None
    dates = parse_date_phrase(date_part.strip())
    return {"priceAdult": price_adult, "priceChild": price_child, "dates": dates} if dates else None


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
    hl = heading_substr.lower()
    for h, b in sections.items():
        if hl in h.lower():
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
            print(f"  WARN: no section for '{name}'", file=sys.stderr)
            continue

        # We need li items from this specific section — re-extract from raw html
        raw_section = ""
        for heading_raw, body_raw in re.findall(
            r"<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[23]|$)", html, re.DOTALL
        ):
            if meta["heading"].lower() in clean(heading_raw).lower():
                raw_section = body_raw
                break

        price_entries = []
        for item in re.findall(r"<li>(.*?)</li>", raw_section, re.DOTALL):
            line = clean(item)
            if "$" in line and " for " in line.lower():
                parsed = parse_price_line(line)
                if parsed:
                    price_entries.append(parsed)

        # Fall back: parse discrete dates from body text if no price lines
        if not price_entries:
            # Extract date list from body like "will be offered on August 7, 11, ... and 31"
            m = re.search(r"(?:offered|held)\s+(?:on\s+)?(.+?)(?:\.|$)", body, re.IGNORECASE)
            if m:
                dates = parse_date_phrase(m.group(1))
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
                print(f"  WARN: no dates/prices for '{name}'", file=sys.stderr)
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
            print(f"  WARN: no section for '{ev['heading']}'", file=sys.stderr)
            continue

        dates = extract_date_range(body)
        if not dates:
            # Try parsing discrete dates (e.g. Puzzlehop "took place on February 6")
            m = re.search(r"(?:took place|held|will be held)\s+(?:on\s+)?([A-Za-z]+ \d+)", body, re.IGNORECASE)
            if m:
                dates = parse_date_phrase(m.group(1))

        if not dates:
            print(f"  WARN: no dates for '{ev['heading']}': {body[:120]}", file=sys.stderr)
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

    output = {
        "scrapedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": URL,
        "byDate": events_by_date,
        "events": raw_events,
    }
    return output


if __name__ == "__main__":
    data = scrape()
    with open("events-data.json", "w") as f:
        json.dump(data, f, indent=2)
    total_dates = sum(len(e["dates"]) for e in data["events"])
    print(f"Wrote events-data.json: {len(data['events'])} events, {total_dates} date entries", file=sys.stderr)
