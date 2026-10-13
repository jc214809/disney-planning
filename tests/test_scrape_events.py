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
