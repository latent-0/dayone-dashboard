# Dayone Command Centre

Admin dashboard for **Day One Technologies** (day1tech.com) and **Dayone Venture Partners** (dayoneventurepartners.com).

- **Live leads**: every tab of both Google Sheets is fetched server-side (cached 30 s, UI polls every 60 s). Rows are normalised, scored 0–100, and test submissions / cold solicitations are auto-flagged and excluded from the numbers (toggle "Show test & spam" to see them).
- **Search & AI visibility**: both sites are audited live for SEO, AEO, GEO, performance and security, with ranked fixes. Audits re-run every 6 h and score history is stored in `data/history.json`.
- **Insights**: lead-quality funnel, demand breakdowns, sheet data-quality issues, playbook.

## Run

```bash
npm start            # http://localhost:3000   (Node 20+, zero dependencies)
```

| Env var | Purpose |
| --- | --- |
| `SHEET_ID_TECH`, `SHEET_ID_VENTURES` | Google Sheet IDs for the two lead sheets. **Required.** Copy `.env.example` to `.env` locally. |
| `PORT` | Port (default 3000) |
| `DASH_PASSWORD` | If set, the whole dashboard requires this password (HTTP Basic). **Set this before deploying.** |
| `DASH_USERNAME` | Optional: also require this username (case-insensitive). |
| `PSI_API_KEY` | Free Google PageSpeed API key; adds Lighthouse scores + LCP/CLS/TBT to the Websites view. |

## Configure

`lib/config.js` holds the tab gids; the sheet IDs come from env vars. Add a tab = add one line. Sheets must be shared as "Anyone with the link: Viewer".

## Notes

- Performance numbers (TTFB, HTML weight, compression) are measured from the machine running this server, not from real users.
- Real-user traffic (visitors, sources, conversions) is not included; that needs Google Search Console / GA4 access.
- Needs a long-running Node host (Render, Railway, Fly, a VPS). It is not a static site.
