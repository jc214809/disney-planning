import sys
sys.dont_write_bytecode = True
import importlib.util
import os
import pathlib
import unittest

os.environ.setdefault("EVENT_URL", "https://example.invalid")
_spec = importlib.util.spec_from_file_location(
    "scrape_events", pathlib.Path(__file__).resolve().parent.parent / "scrape-events.py")
se = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(se)


class SectionYear(unittest.TestCase):
    def test_reads_year_from_text(self):
        self.assertEqual(se.section_year("The 2026 Epcot Food and Wine Festival will be held..."), 2026)
        self.assertEqual(se.section_year("In 2027, the Marathon will be held January 6-10. Registration opened March 17, 2026"), 2027)

    def test_missing_year(self):
        self.assertIsNone(se.section_year("No year here"))


class Dates(unittest.TestCase):
    def test_range_uses_stated_year_even_if_month_already_passed(self):
        # Regression: guess_year bumped Aug-Nov to next year once today's month passed August
        d = se.extract_date_range("held August 27 through November 21.", year=2026)
        self.assertEqual((d[0], d[-1]), ("2026-08-27", "2026-11-21"))

    def test_range_crossing_new_year(self):
        d = se.extract_date_range("held December 28 - January 3.", year=2026)
        self.assertEqual((d[0], d[-1]), ("2026-12-28", "2027-01-03"))

    def test_same_month_range(self):
        d = se.extract_date_range("held October 22-25.", year=2026)
        self.assertEqual((d[0], d[-1]), ("2026-10-22", "2026-10-25"))

    def test_phrase_uses_stated_year(self):
        self.assertEqual(se.parse_date_phrase("August 7, 11; September 1", 2026),
                         ["2026-08-07", "2026-08-11", "2026-09-01"])

    def test_phrase_crossing_new_year_bumps_year(self):
        # Regression: Jollywood Nights lists "...; December 23; January 3 and 5" under "In 2026"
        self.assertEqual(se.parse_date_phrase("November 7; December 23; January 3 and 5", 2026),
                         ["2026-11-07", "2026-12-23", "2027-01-03", "2027-01-05"])

    def test_price_line_uses_stated_year(self):
        r = se.parse_price_line("$126.74 (age 10+), $116.09 (age 3-9) for August 11, 14", 2026)
        self.assertEqual(r["dates"], ["2026-08-11", "2026-08-14"])
        self.assertEqual((r["priceAdult"], r["priceChild"]), (126.74, 116.09))


    def test_price_line_unlabeled_child_price(self):
        # Regression: "$206.61 (age 10+), $195.96 for ..." had priceChild None
        r = se.parse_price_line("$206.61 (age 10+), $195.96 for November 23; December 5, 7; January 3", 2026)
        self.assertEqual((r["priceAdult"], r["priceChild"]), (206.61, 195.96))
        self.assertEqual(r["dates"], ["2026-11-23", "2026-12-05", "2026-12-07", "2027-01-03"])

    def test_price_line_adult_only_unlabeled(self):
        r = se.parse_price_line("$150.00 for August 1", 2026)
        self.assertEqual((r["priceAdult"], r["priceChild"]), (150.0, None))

    def test_price_line_all_ages_label(self):
        r = se.parse_price_line("$99.00 (ages 3 and up) for August 1", 2026)
        self.assertEqual((r["priceAdult"], r["priceChild"]), (99.0, 99.0))


def _data(entries):
    """entries: {(date, name): extra_fields} -> minimal events-data dict"""
    by_date = {}
    for (date, name), extra in entries.items():
        by_date.setdefault(date, []).append({"name": name, "park": "EPCOT", **extra})
    return {"byDate": by_date, "events": []}


class Report(unittest.TestCase):
    TODAY = __import__("datetime").datetime(2026, 10, 13)

    def test_new_event_is_notable(self):
        old = _data({("2026-11-01", "A"): {}})
        new = _data({("2026-11-01", "A"): {}, ("2026-11-02", "B"): {}, ("2026-11-03", "B"): {}})
        md, notable = se.diff_events(old, new, self.TODAY)
        self.assertTrue(notable)
        self.assertIn("**New:** B (2 dates, 2026-11-02 to 2026-11-03)", md)

    def test_removed_event_is_notable(self):
        md, notable = se.diff_events(_data({("2026-11-01", "A"): {}}), _data({("2026-11-01", "B"): {}}), self.TODAY)
        self.assertTrue(notable)
        self.assertIn("**No longer listed:** A", md)

    def test_date_and_price_changes_reported_but_not_notable(self):
        old = _data({("2026-11-01", "A"): {"priceAdult": 100}, ("2026-11-02", "A"): {}})
        new = _data({("2026-11-01", "A"): {"priceAdult": 120}, ("2026-11-03", "A"): {}})
        md, notable = se.diff_events(old, new, self.TODAY)
        self.assertFalse(notable)
        self.assertIn("1 dates added", md)
        self.assertIn("1 dates removed", md)
        self.assertIn("1 dates changed", md)

    def test_no_changes(self):
        d = _data({("2026-11-01", "A"): {}})
        md, notable = se.diff_events(d, d, self.TODAY)
        self.assertEqual((md, notable), ("", False))

    def test_ageing_out_is_not_a_change(self):
        # Old file still has a date that has since fallen out of the 60-day window
        old = _data({("2026-06-01", "Gone"): {}, ("2026-11-01", "A"): {}})
        new = _data({("2026-11-01", "A"): {}})
        self.assertEqual(se.diff_events(old, new, self.TODAY), ("", False))

    def test_unrecognized_headings(self):
        heads = ["Epcot International Food and Wine Festival", "Valentine\u2019s Day", "Eat to the Beat Dining Package",
                 "Star Wars Galactic Nights", "Mother\u2019s Day"]
        self.assertEqual(se.unrecognized_headings(heads), ["Star Wars Galactic Nights"])

    def test_new_page_section_is_listed_but_never_alerts(self):
        # Text/heading changes on the page alone must not trigger an alert
        d = _data({("2026-11-01", "A"): {}})
        md, notable = se.build_report(d, d, ["Star Wars Galactic Nights"], self.TODAY)
        self.assertFalse(notable)
        self.assertIn("Star Wars Galactic Nights", md)

    def test_report_without_baseline_is_not_notable(self):
        d = _data({("2026-11-01", "A"): {}})
        md, notable = se.build_report(None, d, [], self.TODAY)
        self.assertFalse(notable)
        self.assertIn("No previous published data", md)

    def test_report_new_event_is_notable(self):
        old = _data({("2026-11-01", "A"): {}})
        new = _data({("2026-11-01", "A"): {}, ("2026-11-02", "B"): {}})
        self.assertTrue(se.build_report(old, new, [], self.TODAY)[1])

    def test_report_unchanged_data(self):
        d = _data({("2026-11-01", "A"): {}})
        md, notable = se.build_report(d, d, [], self.TODAY)
        self.assertFalse(notable)
        self.assertIn("No changes since the last scrape.", md)


class Prune(unittest.TestCase):
    def _data(self):
        return {
            "byDate": {"2026-06-01": [{"name": "Old"}], "2026-09-01": [{"name": "Recent"}], "2026-12-01": [{"name": "New"}]},
            "events": [
                {"name": "Old", "dates": [{"date": "2026-06-01"}]},
                {"name": "Spans", "dates": [{"date": "2026-06-01"}, {"date": "2026-09-01"}, {"date": "2026-12-01"}]},
            ],
        }

    def test_drops_dates_older_than_grace(self):
        from datetime import datetime
        d = se.prune_past(self._data(), today=datetime(2026, 10, 13), grace_days=60)
        self.assertEqual(sorted(d["byDate"]), ["2026-09-01", "2026-12-01"])  # Aug 14 cutoff
        self.assertEqual([e["name"] for e in d["events"]], ["Spans"])
        self.assertEqual([x["date"] for x in d["events"][0]["dates"]], ["2026-09-01", "2026-12-01"])

    def test_cutoff_day_is_kept(self):
        from datetime import datetime
        d = {"byDate": {"2026-08-14": [1], "2026-08-13": [1]}, "events": []}
        self.assertEqual(sorted(se.prune_past(d, today=datetime(2026, 10, 13), grace_days=60)["byDate"]), ["2026-08-14"])


class Narrators(unittest.TestCase):
    def test_narrator_ranges(self):
        d, a = se.parse_lineup_item("November 29 - December 1: Gary Sinise", 2026)
        self.assertEqual((d[0], d[-1], len(d), a), ("2026-11-29", "2026-12-01", 3, "Gary Sinise"))
        d, a = se.parse_lineup_item("December 28-30: Eva Longoria", 2026)
        self.assertEqual((d[0], d[-1], a), ("2026-12-28", "2026-12-30", "Eva Longoria"))

    def test_tba_name(self):
        self.assertEqual(se.lineup_name("Candlelight Processional", "TBA", narrators=True),
                         "Candlelight Processional: Narrator TBA")
        self.assertEqual(se.lineup_name("Eat to the Beat", "TBA"), "Eat to the Beat: TBA")
        self.assertEqual(se.lineup_name("Candlelight Processional", "Gary Sinise", narrators=True),
                         "Candlelight Processional: Gary Sinise")


class Holidays(unittest.TestCase):
    def test_single_date(self):
        self.assertEqual(se.parse_single_date("In 2027, Easter Sunday will be March 28. In Epcot...", 2027), ["2027-03-28"])
        self.assertEqual(se.parse_single_date("In 2026, Thanksgiving will be November 26.", 2026), ["2026-11-26"])

    def test_single_date_missing(self):
        self.assertEqual(se.parse_single_date("Valentine's Day is February 14 every year."), [])

    def test_range_crossing_new_year_for_christmas_decor(self):
        d = se.extract_date_range("In 2026, Magic Kingdom will have holiday entertainment and décor November 13 through January 6.", 2026)
        self.assertEqual((d[0], d[-1], len(d)), ("2026-11-13", "2027-01-06", 55))

    def test_month_of(self):
        self.assertEqual(se.month_of("Throughout the month of April, Earth Month takes place"), 4)
        self.assertEqual(se.month_of("During the month of December, Disney offers"), 12)
        self.assertIsNone(se.month_of("no month here"))

    def test_fixed_dates_each_year(self):
        self.assertEqual(se.fixed_dates(7, [3, 4], [2026, 2027]),
                         ["2026-07-03", "2026-07-04", "2027-07-03", "2027-07-04"])

    def test_fixed_dates_whole_month(self):
        d = se.fixed_dates(12, None, [2026])
        self.assertEqual((d[0], d[-1], len(d)), ("2026-12-01", "2026-12-31", 31))
        feb = se.fixed_dates(2, None, [2027])
        self.assertEqual(len(feb), 28)

    def test_find_section_ignores_apostrophe_style(self):
        secs = {"New Year\u2019s Eve": "x", "Christmas Eve & Christmas Day": "y"}
        self.assertEqual(se.find_section(secs, "New Years Eve")[1], "x")


class Lineup(unittest.TestCase):
    def test_single_day(self):
        self.assertEqual(se.parse_lineup_item("November 1: Southbound", 2026), (["2026-11-01"], "Southbound"))

    def test_day_range(self):
        dates, act = se.parse_lineup_item("March 5-7: The Music of ABBA", 2026)
        self.assertEqual((dates, act), (["2026-03-05", "2026-03-06", "2026-03-07"], "The Music of ABBA"))

    def test_cross_month_range_with_dash_variants(self):
        d, a = se.parse_lineup_item("September 30 - October 1: Smash Mouth", 2026)
        self.assertEqual((d, a), (["2026-09-30", "2026-10-01"], "Smash Mouth"))
        d, _ = se.parse_lineup_item("May 31-June 1: Maverick City Music", 2026)
        self.assertEqual((d[0], d[-1]), ("2026-05-31", "2026-06-01"))

    def test_act_name_may_contain_colon(self):
        _, act = se.parse_lineup_item("March 24-26: Evolution: Motown", 2026)
        self.assertEqual(act, "Evolution: Motown")

    def test_month_typo_on_page(self):
        # The page really says "Mary 5-7: M-80's"
        dates, act = se.parse_lineup_item("Mary 5-7: M-80's", 2026)
        self.assertEqual((dates[0], dates[-1], act), ("2026-05-05", "2026-05-07", "M-80's"))

    def test_non_lineup_lines_ignored(self):
        self.assertIsNone(se.parse_lineup_item("Performances are at 5:30, 6:45 and 8:00 pm.", 2026))
        self.assertIsNone(se.parse_lineup_item("Note: tickets required", 2026))


if __name__ == "__main__":
    unittest.main()
