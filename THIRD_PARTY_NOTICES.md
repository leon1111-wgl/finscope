# Third-party notices

FinScope's original code and authored synthetic fixtures use the repository MIT license. It does not replace the terms for dependencies, external data or model weights. No pretrained model weights are included.

| Project / source | Relationship | License / terms reference |
| --- | --- | --- |
| [scikit-learn](https://github.com/scikit-learn/scikit-learn) | Estimators, preprocessing and text similarity | [BSD-3-Clause](https://github.com/scikit-learn/scikit-learn/blob/main/COPYING) |
| [NumPy](https://github.com/numpy/numpy) | Numerical arrays | [BSD-3-Clause](https://github.com/numpy/numpy/blob/main/LICENSE.txt) |
| [pandas](https://github.com/pandas-dev/pandas) | Tabular data | [BSD-3-Clause](https://github.com/pandas-dev/pandas/blob/main/LICENSE) |
| [FastAPI](https://github.com/fastapi/fastapi) | API | [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE) |
| [Starlette](https://github.com/Kludex/starlette) / [Uvicorn](https://github.com/Kludex/uvicorn) | ASGI tools | Upstream BSD-3-Clause licenses |
| [EdgarTools](https://github.com/dgunning/edgartools) | CompanyFacts parser integration | [MIT](https://github.com/dgunning/edgartools/blob/main/LICENSE.txt) |
| [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | Separate selected public financial facts | SEC access policies apply; preserve source/filer provenance |

Dependency distributions retain their own notices, including transitive dependencies in `requirements.lock`. This repository imports their public interfaces; it does not vendor their source code.

The synthetic trading demo contains no redistributed Yahoo Finance prices, social-media feed, proprietary supply logs or course assignments. A code library's open-source license does not grant rights to data obtained with it. Imported data remains local until the user deliberately exports or publishes it.

Research papers are linked and summarized in original words. Their authors do not endorse FinScope. Qlib and other unimplemented reference projects retain their own licenses and attribution; the research list is not a statement that their models run in this application.


## Online annual-financial workspace

SEC CompanyFacts supplies standard US-GAAP facts and filing identifiers. Source: https://www.sec.gov/search-filings/edgar-application-programming-interfaces. Data is attributed to its original filings; no SEC endorsement is implied.

Treasury CMT data is published by the US Treasury Office of Debt Management. The official data.gov listing identifies CC0: https://catalog.data.gov/dataset/interest-rate-statistics-daily-treasury-yield-curve-rates. CMT rates are interpolated reference yields, not executed prices or company financing rates.

Isolation Forest is an existing algorithm supplied by scikit-learn; FinScope does not claim to invent it. The scikit-learn BSD license applies to that dependency.
