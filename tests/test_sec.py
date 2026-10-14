from finscope.sec import select_companyfacts


def test_sec_annual_duration_and_asof_restated_selection():
    facts = {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [
        {"start": "2022-01-01", "end": "2022-12-31", "val": 100, "filed": "2023-02-01", "accn": "old", "form": "10-K", "fy": 2022, "fp": "FY"},
        {"start": "2022-01-01", "end": "2022-12-31", "val": 110, "filed": "2023-04-01", "accn": "revised", "form": "10-K", "fy": 2022, "fp": "FY"},
        {"start": "2022-10-01", "end": "2022-12-31", "val": 50, "filed": "2023-01-01", "accn": "quarter", "form": "10-Q", "fy": 2022, "fp": "Q4"},
    ]}}}}}
    early = select_companyfacts(facts, "Revenues", "USD", "2023-03-01", duration="annual")
    late = select_companyfacts(facts, "Revenues", "USD", "2023-05-01", duration="annual")
    assert early["value"] == 100 and early["accession"] == "old"
    assert late["value"] == 110 and late["accession"] == "revised"
    assert late["start"] == "2022-01-01" and late["unit"] == "USD"
    assert select_companyfacts(facts, "Revenues", "shares", "2023-05-01", duration="annual") is None
    assert select_companyfacts(facts, "Revenues", "USD", "2022-12-31", duration="annual") is None


def test_sec_instant_requires_no_start_and_keeps_unit():
    facts = {"facts": {"us-gaap": {"Assets": {"units": {"USD": [
        {"end": "2022-12-31", "val": 70, "filed": "2023-02-01", "accn": "annual", "form": "10-K"},
        {"start": "2022-01-01", "end": "2022-12-31", "val": 999, "filed": "2023-02-01", "accn": "wrong-duration", "form": "10-K"},
    ]}}}}}
    chosen = select_companyfacts(facts, "Assets", "USD", "2023-03-01", duration="instant")
    assert chosen["value"] == 70 and chosen["start"] is None and chosen["unit"] == "USD"
