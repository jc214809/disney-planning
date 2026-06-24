# MouseTools API Reference

MouseTools is a Python library that pulls data directly from Disney's internal Couchbase backend. It covers Walt Disney World and Disneyland Resort. This document covers every capability with example raw requests and responses.

Install: `pip install mousetools`

---

## Table of Contents

1. [Facility Data](#1-facility-data)
2. [Live Wait Times & Status](#2-live-wait-times--status)
3. [Forecasted Wait Times](#3-forecasted-wait-times)
4. [Calendar & Park Hours](#4-calendar--park-hours)
5. [Today Channel](#5-today-channel)
6. [Character Appearances](#6-character-appearances)
7. [Dining & Menus](#7-dining--menus)
8. [Weather](#8-weather)
9. [What It Does NOT Have](#9-what-it-does-not-have)

---

## 1. Facility Data

The Facilities channel is the master directory — every attraction, restaurant, resort, land, park, spa, tour, and water park at WDW and Disneyland.

### Entity Types Available

`get_children_attractions()`, `get_children_restaurants()`, `get_children_resorts()`,
`get_children_theme_parks()`, `get_children_water_parks()`, `get_children_spas()`,
`get_children_tours()`, `get_children_lands()` — 21 entity type getters total.

### Example — List all WDW attractions

```python
from mousetools.channels.facilities import FacilityChannel
from mousetools.channels.facilities.enums import DestinationChannelIds

channel = FacilityChannel(DestinationChannelIds.WALT_DISNEY_WORLD)
attractions = channel.get_children_attractions()

for a in attractions[:3]:
    print(a.name, a.entity_type, a.coordinates)
```

**Response:**
```
Seven Dwarfs Mine Train  ATTRACTION  {'latitude': 28.4201, 'longitude': -81.5793}
TRON Lightcycle / Run    ATTRACTION  {'latitude': 28.4198, 'longitude': -81.5779}
Haunted Mansion          ATTRACTION  {'latitude': 28.4196, 'longitude': -81.5830}
```

### Example — Single facility properties

```python
from mousetools.channels.facilities import ThemeParkFacilityChild
from mousetools.channels.facilities.enums import WaltDisneyWorldParkChannelIds

park = ThemeParkFacilityChild(WaltDisneyWorldParkChannelIds.MAGIC_KINGDOM, lazy_load=False)

print(park.name)             # "Magic Kingdom Park"
print(park.coordinates)      # {'latitude': 28.4160036778, 'longitude': -81.5811902834}
print(park.timezone)         # America/New_York
print(park.description)      # "Step into the magic..."
print(park.disney_owned)     # True
print(park.disney_operated)  # True
print(park.admission_required) # True
print(park.is_closed_today()) # False
```

### All facility properties

| Property | Type | Description |
|---|---|---|
| `name` | `str` | Facility display name |
| `entity_type` | `str` | `ATTRACTION`, `RESTAURANT`, `RESORT`, `THEME_PARK`, etc. |
| `coordinates` | `dict` | `{latitude, longitude}` |
| `timezone` | `ZoneInfo` | Local timezone |
| `description` | `str` | Long-form description text |
| `disney_owned` | `bool` | Disney-owned property |
| `disney_operated` | `bool` | Disney-operated (vs third party) |
| `admission_required` | `bool` | Requires park admission |
| `pre_paid` | `bool` | Pre-paid access required |

### Ancestor lookups (where is this facility?)

```python
attraction.ancestor_destination_id    # WDW destination ID
attraction.ancestor_theme_park_id     # parent park ID
attraction.ancestor_resort_id         # parent resort ID
attraction.ancestor_land_id           # land within park (e.g. Fantasyland)
attraction.ancestor_land_name         # "Fantasyland"
```

---

## 2. Live Wait Times & Status

Real-time data refreshed every 10 minutes from Disney's live systems.

### Example — All wait times for a park at once

```python
from mousetools.channels.facilitystatus import FacilityStatusChannel
from mousetools.channels.facilities.enums import WaltDisneyWorldParkChannelIds

status_channel = FacilityStatusChannel(WaltDisneyWorldParkChannelIds.MAGIC_KINGDOM)
all_statuses = status_channel.get_all_statuses()
```

**Response:**
```python
{
  "80010208": {"status": "Operating", "wait_time": 45},
  "80010110": {"status": "Operating", "wait_time": 20},
  "16767284": {"status": "Operating", "wait_time": 70},
  "411504498": {"status": "Closed",   "wait_time": None},
  "80010190": {"status": "Operating", "wait_time": 5},
  ...
}
```

Keys are Disney entity IDs. `wait_time` is `None` when the ride is closed or wait time is unavailable.

### Example — Single attraction status

```python
from mousetools.channels.facilitystatus import AttractionFacilityStatusChild

attraction = AttractionFacilityStatusChild("16767284")  # Seven Dwarfs Mine Train

print(attraction.get_status())              # "Operating"
print(attraction.get_wait_time())           # 65  (minutes)
print(attraction.fast_pass_available)       # True
print(attraction.get_fast_pass_start_time()) # datetime(2026, 6, 24, 9, 0, tzinfo=...)
print(attraction.get_fast_pass_end_time())   # datetime(2026, 6, 24, 21, 0, tzinfo=...)
print(attraction.single_rider)              # False
```

### Entity types with status

| Method | What you get |
|---|---|
| `get_children_attractions()` | Rides — status + wait time |
| `get_children_entertainment()` | Shows — status only |
| `get_children_entertainment_venues()` | Venues (amphitheaters, etc.) |
| `get_children_lands()` | Land open/closed status |
| `get_children_restaurants()` | Dining — open/closed |
| `get_children_theme_parks()` | Park open/closed |
| `get_children_water_parks()` | Water park open/closed |

---

## 3. Forecasted Wait Times

Predicted wait times by time of day — useful for planning which rides to hit and when.

### Example

```python
from mousetools.channels.forecastedwaittimes import ForecastedWaitTimesChildChannel

# channel_id is the forecasted wait times channel ID for a specific attraction
forecast_channel = ForecastedWaitTimesChildChannel("some_channel_id")
forecast = forecast_channel.get_forecast()
```

**Response:**
```python
[
  {
    "forecasted_wait_minutes": 15,
    "bar_graph_percentage": 0.18,
    "accessibility_label": "9:00 AM",
    "timestamp": datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>)
  },
  {
    "forecasted_wait_minutes": 35,
    "bar_graph_percentage": 0.44,
    "accessibility_label": "10:00 AM",
    "timestamp": datetime(2026, 6, 24, 10, 0, tzinfo=<America/New_York>)
  },
  {
    "forecasted_wait_minutes": 75,
    "bar_graph_percentage": 0.94,
    "accessibility_label": "12:00 PM",
    "timestamp": datetime(2026, 6, 24, 12, 0, tzinfo=<America/New_York>)
  },
  {
    "forecasted_wait_minutes": 40,
    "bar_graph_percentage": 0.50,
    "accessibility_label": "3:00 PM",
    "timestamp": datetime(2026, 6, 24, 15, 0, tzinfo=<America/New_York>)
  },
  ...
]
```

You can also access the forecasted wait times channel directly from a facility:

```python
facility = AttractionFacilityChild("16767284")
forecast_channel = facility.get_forecasted_wait_times_channel()
forecast = forecast_channel.get_forecast()
```

---

## 4. Calendar & Park Hours

Disney's calendar system — covers park hours, meal periods, private events, refurbishments, and closures by date.

### Example — Get today's park hours

```python
from mousetools.channels.calendar import CalendarChannel
from mousetools.channels.facilities.enums import DestinationChannelIds

cal = CalendarChannel(DestinationChannelIds.WALT_DISNEY_WORLD)
today = cal.get_today_calendar()

print(today.all_park_hours)
```

**Response:**
```python
[
  {
    "entity_id": "80007944",       # Magic Kingdom
    "schedule_type": "Operating",
    "start_time": datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 24, 23, 0, tzinfo=<America/New_York>),
    "closed": False
  },
  {
    "entity_id": "80007944",
    "schedule_type": "Early Entry",
    "start_time": datetime(2026, 6, 24, 8, 30, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),
    "closed": False
  },
  {
    "entity_id": "80007998",       # Hollywood Studios
    "schedule_type": "Operating",
    "start_time": datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 24, 22, 0, tzinfo=<America/New_York>),
    "closed": False
  },
  ...
]
```

### Example — Get hours for a specific park on a specific date

```python
calendar = cal.get_calendar(day=25, month=6)
hours = calendar.get_park_hours("80007944")  # Magic Kingdom entity ID
```

**Response:**
```python
{
  "Operating": {
    "start_time": datetime(2026, 6, 25, 9, 0, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 25, 23, 0, tzinfo=<America/New_York>),
    "closed": False
  },
  "Early Entry": {
    "start_time": datetime(2026, 6, 25, 8, 30, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 25, 9, 0, tzinfo=<America/New_York>),
    "closed": False
  }
}
```

### Example — Refurbishments

```python
print(today.all_refurbishments)
```

**Response:**
```python
[
  {
    "entity_id": "80010208",
    "start_time": datetime(2026, 6, 10, 0, 0, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 7, 5, 0, 0, tzinfo=<America/New_York>)
  },
  ...
]
```

### Example — Private events (park buyouts, after-hours)

```python
print(today.all_private_events)
```

**Response:**
```python
[
  {
    "entity_id": "80007944",
    "schedule_type": "Special Ticketed Event",
    "start_time": datetime(2026, 6, 24, 21, 30, tzinfo=<America/New_York>),
    "end_time":   datetime(2026, 6, 25, 0, 30, tzinfo=<America/New_York>),
    "closed": False
  }
]
```

### Example — Closures

```python
refurb = today.get_refurbishment("80010208")
# {"start_time": datetime(...), "end_time": datetime(...)}

closed = today.get_closed("80010208")
# {"start_time": datetime(...), "end_time": datetime(...)}
```

### Example — Meal periods (restaurants)

```python
print(today.all_meal_periods)
```

**Response:**
```python
{
  "90002100": [   # San Angel Inn
    {
      "schedule_type": "Lunch",
      "start_time": datetime(2026, 6, 24, 11, 30, tzinfo=<America/New_York>),
      "end_time":   datetime(2026, 6, 24, 15, 30, tzinfo=<America/New_York>),
      "closed": False
    },
    {
      "schedule_type": "Dinner",
      "start_time": datetime(2026, 6, 24, 16, 0, tzinfo=<America/New_York>),
      "end_time":   datetime(2026, 6, 24, 21, 0, tzinfo=<America/New_York>),
      "closed": False
    }
  ],
  ...
}
```

---

## 5. Today Channel

Live same-day data — facility schedules and closures for the current day.

### Example

```python
from mousetools.channels.today import TodayChannel
from mousetools.channels.facilities.enums import DestinationChannelIds

today_channel = TodayChannel(DestinationChannelIds.WALT_DISNEY_WORLD)
children = today_channel.get_children_channels()

# Get a specific entity type
entity = today_channel.get_entity("attraction")

schedules = entity.all_facility_schedules
```

**Response (`all_facility_schedules`):**
```python
{
  "16767284": [   # Seven Dwarfs Mine Train
    {
      "start_time": datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),
      "end_time":   datetime(2026, 6, 24, 23, 0, tzinfo=<America/New_York>),
      "schedule_type": "Operating",
      "closed": False
    }
  ],
  "411504498": [  # TRON Lightcycle / Run
    {
      "start_time": datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),
      "end_time":   datetime(2026, 6, 24, 22, 0, tzinfo=<America/New_York>),
      "schedule_type": "Operating",
      "closed": False
    }
  ],
  ...
}
```

### Get schedule for a single facility

```python
schedule = entity.get_schedule("16767284")
open_time, close_time = entity.get_open_close_hours("16767284")
```

**`get_open_close_hours` response:**
```python
(
  datetime(2026, 6, 24, 9, 0, tzinfo=<America/New_York>),   # earliest open
  datetime(2026, 6, 24, 23, 0, tzinfo=<America/New_York>)   # latest close
)
```

---

## 6. Character Appearances

Where and when characters are meeting today.

### Example

```python
from mousetools.channels.characters import CharactersChannel
from mousetools.channels.facilities.enums import DestinationChannelIds

chars = CharactersChannel(DestinationChannelIds.WALT_DISNEY_WORLD)
all_characters = chars.get_children_channels()

for char in all_characters[:2]:
    print(char.name)
    print(char.description)
    print(char.thumbnail_url)
    print(char.banner_url)
    for appearance in char.get_appearances():
        print(appearance)
```

**Response (`get_appearances()`):**
```python
[
  {
    "start_datetime":   datetime(2026, 6, 24, 9, 0,  tzinfo=<America/New_York>),
    "end_datetime":     datetime(2026, 6, 24, 10, 0, tzinfo=<America/New_York>),
    "start_time_str":   "9:00 AM",
    "end_time_str":     "10:00 AM",
    "coordinates":      {"latitude": 28.4196, "longitude": -81.5830},
    "facility_id":      "80010153",
    "location_name":    "Fantasyland",
    "location_id":      "80010153",
    "ancestor_land_id": "80010153",
    "ancestor_land_name": "Fantasyland"
  },
  {
    "start_datetime":   datetime(2026, 6, 24, 11, 30, tzinfo=<America/New_York>),
    "end_datetime":     datetime(2026, 6, 24, 12, 30, tzinfo=<America/New_York>),
    "start_time_str":   "11:30 AM",
    "end_time_str":     "12:30 PM",
    "coordinates":      {"latitude": 28.4196, "longitude": -81.5830},
    "facility_id":      "80010153",
    "location_name":    "Fantasyland",
    "location_id":      "80010153",
    "ancestor_land_id": "80010153",
    "ancestor_land_name": "Fantasyland"
  }
]
```

---

## 7. Dining & Menus

Access menus for any restaurant facility.

### Example

```python
from mousetools.channels.facilities import RestaurantFacilityChild

restaurant = RestaurantFacilityChild("90002100")  # San Angel Inn
menu = restaurant.get_menu()

print(menu)  # Menus object — structure varies by restaurant
```

Also available directly from a facility:

```python
facility = channel.get_children_restaurants()[0]
print(facility.get_today_meal_periods())
print(facility.get_today_schedule())
```

---

## 8. Weather

OpenWeatherMap integration — current weather at any facility's coordinates.

### Example

```python
park = ThemeParkFacilityChild(WaltDisneyWorldParkChannelIds.MAGIC_KINGDOM)
weather = park.get_current_weather(api_key="YOUR_OWM_KEY")
```

**Response:**
```python
{
  "temp": 91.2,           # Fahrenheit
  "feels_like": 98.4,
  "humidity": 72,
  "description": "partly cloudy",
  "wind_speed": 8.3,
  "icon": "02d"
}
```

---

## 9. What It Does NOT Have

| Data | Available? | Alternative |
|---|---|---|
| Hotel room pricing | ✗ | Disney website / Undercover Tourist |
| Hotel availability | ✗ | Disney website |
| Resort tier info (Value/Mod/Deluxe) | ✗ | Hardcode — rarely changes |
| LL / ILL pricing | ✗ | themeparks.wiki API |
| LL availability by ride | ✗ | themeparks.wiki API |
| Park schedules (future dates) | Partial (Calendar) | themeparks.wiki API |
| Dining reservations | ✗ | Disney website |
| Historical wait time data | ✗ | TouringPlans API |

---

## Destination & Park Enums

```python
from mousetools.channels.facilities.enums import (
    DestinationChannelIds,
    WaltDisneyWorldParkChannelIds,
    DisneylandResortParkChannelIds,
)

# Destinations
DestinationChannelIds.WALT_DISNEY_WORLD
DestinationChannelIds.DISNEYLAND_RESORT

# WDW Parks
WaltDisneyWorldParkChannelIds.MAGIC_KINGDOM
WaltDisneyWorldParkChannelIds.EPCOT
WaltDisneyWorldParkChannelIds.HOLLYWOOD_STUDIOS
WaltDisneyWorldParkChannelIds.ANIMAL_KINGDOM
WaltDisneyWorldParkChannelIds.BLIZZARD_BEACH
WaltDisneyWorldParkChannelIds.TYPHOON_LAGOON

# Disneyland Parks
DisneylandResortParkChannelIds.DISNEYLAND
DisneylandResortParkChannelIds.CALIFORNIA_ADVENTURE
```

---

## Summary — What MouseTools Can Power in a Trip Planner

| Feature | Source |
|---|---|
| Live wait times | `FacilityStatusChannel` |
| Forecasted wait times by hour | `ForecastedWaitTimesChannel` |
| Ride open/closed status | `FacilityStatusChannel` |
| Single rider & LL availability flags | `FacilityStatusChannel` |
| Park open/close hours | `CalendarChannel` or `TodayChannel` |
| Early Entry hours | `CalendarChannel` |
| Special/private events | `CalendarChannel` |
| Refurbishments | `CalendarChannel` |
| Restaurant meal periods | `CalendarChannel` |
| Character meet times & locations | `CharactersChannel` |
| Attraction coordinates (map) | `FacilityChannel` |
| Current weather at park | `FacilityChannel.get_current_weather()` |
