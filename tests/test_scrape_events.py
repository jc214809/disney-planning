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


if __name__ == "__main__":
    unittest.main()
