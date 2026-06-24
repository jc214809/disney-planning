#!/usr/bin/env python3
"""
Scrapes Walt Disney World special event pricing 
and writes events-data.json with per-date ticket prices.

Run manually: python3 scrape-events.py
Or via GitHub Actions weekly.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime

URL = os.environ["EVENT_URL"]

# Map section heading substrings to canonical event names + park
EVENT_MAP = {
    "Not-So-Scary": {
        "name": "Mickey's Not-So-Scary Halloween Party",
        "park": "Magic Kingdom",
        "requiresTicket": True,
    },
    "Very Merry Christmas": {
        "name": "Mickey's Very Merry Christmas Party",
        "park": "Magic Kingdom",
        "requiresTicket": True,
    },
    "Jollywood": {
        "name": "Disney Jollywood Nights",
        "park": "Hollywood Studios",
        "requiresTicket": True,
    },
    "H2O Glow": {
        "name": "Disney H2O Glow After Hours",
        "park": "Typhoon Lagoon",
        "requiresTicket": True,
    },
}

# Month name -> number
MONTH_NUMS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

def fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": "disney-planning-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)

def decode_entities(s):
    return (s
        .replace("&#8211;", "-")
        .replace("&#8212;", "-")
        .replace("&#8217;", "'")
        .replace("&#8216;", "'")
        .replace("&#8220;", '"')
        .replace("&#8221;", '"')
        .replace("&amp;", "&")
        .replace("&nbsp;", " ")
    )

def clean(s):
    return re.sub(r"\s+", " ", decode_entities(strip_tags(s))).strip()

def guess_year(month_num, ref_year=None):
    """Pick the most plausible year for a given month number given today's date."""
    today = datetime.today()
    ref_year = ref_year or today.year
    # If the month is already past this year, assume next year
    if month_num < today.month:
        return today.year + 1
    return today.year

def parse_date_phrase(phrase, context_year=None):
    """
    Turn phrases like 'August 11, 14', 'September 1', 'November 7, 25, 26, 30; December 2, 4'
    into a list of 'YYYY-MM-DD' strings.
    """
    dates = []
    # Split on semicolons to get month groups
    groups = [g.strip() for g in phrase.split(";")]
    for group in groups:
        # e.g. "August 11, 14" or "December 2, 4"
        m = re.match(r"([A-Za-z]+)\s+([\d,\s]+)", group)
        if not m:
            continue
        month_name = m.group(1).lower()
        month_num = MONTH_NUMS.get(month_name)
        if not month_num:
            continue
        year = guess_year(month_num, context_year)
        day_strs = re.findall(r"\d+", m.group(2))
        for day_str in day_strs:
            try:
                d = datetime(year, month_num, int(day_str))
                dates.append(d.strftime("%Y-%m-%d"))
            except ValueError:
                pass
    return dates

def parse_price(s):
    """Extract float from '$126.74' -> 126.74"""
    m = re.search(r"\$\s*([\d,]+\.?\d*)", s)
    if not m:
        return None
    return float(m.group(1).replace(",", ""))

def parse_price_line(line):
    """
    Parse lines like:
      '$126.74 (age 10+), $116.09 (age 3-9) for August 11, 14'
      '$169.34 (age 3 and up) for November 17'
    Returns dict with priceAdult, priceChild (may be same), dates list.
    """
    # Split on ' for ' to get price part and date part
    parts = re.split(r"\s+for\s+", line, maxsplit=1)
    if len(parts) != 2:
        return None

    price_part, date_part = parts

    # Find all price+age pairs: '$126.74 (age 10+)' or '$169.34 (age 3 and up)'
    pairs = re.findall(r"\$\s*[\d,]+\.?\d*\s*\([^)]+\)", price_part)

    price_adult = None
    price_child = None

    for pair in pairs:
        price = parse_price(pair)
        age_m = re.search(r"\(age\s+([^)]+)\)", pair, re.IGNORECASE)
        if not age_m:
            # 'age 3 and up' style already captured above
            price_adult = price
            price_child = price
            continue
        age_text = age_m.group(1).lower()
        # child = age 3-9, adult = age 10+, or 'age 3 and up' = all ages same price
        if "10" in age_text or "adult" in age_text:
            price_adult = price
        elif "3" in age_text and "up" in age_text:
            price_adult = price
            price_child = price
        else:
            price_child = price

    if price_adult is None:
        return None

    dates = parse_date_phrase(date_part.strip())
    if not dates:
        return None

    return {"priceAdult": price_adult, "priceChild": price_child, "dates": dates}

def scrape():
    print(f"Fetching {URL} ...", file=sys.stderr)
    html = fetch_html(URL)

    # Strip scripts and styles
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)

    # Split into sections by h2/h3
    parts = re.split(r"(<h[23][^>]*>)", html)

    events_by_date = {}  # date -> [event entry, ...]
    raw_events = []      # [{name, park, requiresTicket, dates: [{date, priceAdult, priceChild}]}]

    current_event_key = None

    for i, part in enumerate(parts):
        if re.match(r"<h[23]", part):
            next_text = clean(parts[i + 1]) if i + 1 < len(parts) else ""
            current_event_key = None
            for key, meta in EVENT_MAP.items():
                if key.lower() in next_text.lower():
                    current_event_key = key
                    break
            continue

        if current_event_key is None:
            continue

        # Find all <li> items in this section chunk
        li_items = re.findall(r"<li>(.*?)</li>", part, re.DOTALL)
        price_entries = []
        for item in li_items:
            line = clean(item)
            if "$" not in line or " for " not in line.lower():
                continue
            parsed = parse_price_line(line)
            if parsed:
                price_entries.append(parsed)

        if not price_entries:
            continue

        meta = EVENT_MAP[current_event_key]
        event_dates = []
        for entry in price_entries:
            for date in entry["dates"]:
                event_dates.append({
                    "date": date,
                    "priceAdult": entry["priceAdult"],
                    "priceChild": entry["priceChild"],
                })
                # Also index by date for quick calendar lookup
                if date not in events_by_date:
                    events_by_date[date] = []
                events_by_date[date].append({
                    "name": meta["name"],
                    "park": meta["park"],
                    "requiresTicket": meta["requiresTicket"],
                    "priceAdult": entry["priceAdult"],
                    "priceChild": entry["priceChild"],
                })

        if event_dates:
            raw_events.append({
                "name": meta["name"],
                "park": meta["park"],
                "requiresTicket": meta["requiresTicket"],
                "dates": sorted(event_dates, key=lambda x: x["date"]),
            })
        current_event_key = None  # consume — one section per event

    output = {
        "scrapedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": URL,
        "byDate": events_by_date,
        "events": raw_events,
    }

    return output

if __name__ == "__main__":
    data = scrape()
    out_path = "events-data.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    total_dates = sum(len(e["dates"]) for e in data["events"])
    print(f"Wrote {out_path}: {len(data['events'])} events, {total_dates} date entries", file=sys.stderr)
