# TASK-501 Lighthouse (mobile, local dev server, mock Mengantar)

| Page | Performance | Accessibility | Best practices | SEO | Lighthouse |
|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 12.6.0 |
| `/kirim` | 100 | 100 | 100 | 100 | 12.6.0 |
| `/lacak?q=JT4719667079` | 100 | 100 | 100 | 66 | 12.6.0 |

`/lacak` is `noindex` by design (private tracking, spec 05 §3); that is its only SEO deduction (`is-crawlable`). The
indexable pages (`/`, `/kirim`) meet the ≥ 90 target on all three required categories.
