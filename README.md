# GitHub Analytics Dashboard — Vanilla JS

Enter any GitHub username and get a live profile analysis — language breakdown,
top repositories, a 90-day activity heatmap, a repos-per-year timeline, a featured
repo, and a follower trend. Built with **plain HTML, CSS, and JavaScript**: no
React, no Recharts, no Chart.js, no build step. **One file, zero dependencies.**

Charts are hand-drawn in SVG/CSS; data comes straight from the GitHub REST API
via `fetch`.

## Run

Open `index.html` in a browser. That's it.

(If the browser blocks `fetch` from `file://`, serve the folder:
`python -m http.server` then open `http://localhost:8000`.)

Add `?selftest` to the URL to run the built-in assertions in the console.

Optionally paste a GitHub token to raise the API limit from 60 to 5,000
requests/hour. It stays in your browser.

## Features

- **Language breakdown** — SVG donut + legend, weighted by repo count.
- **Top repositories by stars** — CSS bar chart.
- **Recent activity heatmap** — public push events over ~90 days (CSS grid).
- **Repos created per year** — CSS column chart.
- **Featured top repo** — description, language, stars / forks / issues.
- **Recently pushed** — latest source repos with relative timestamps.
- **Follower trend** — SVG line/area, accumulated from localStorage snapshots.
- **Shareable URLs** — `?user=…` deep links; back/forward navigation works.
- **Robust states** — skeleton loading, teaching empty states, and clear error
  messages with a retry button.

## Interview angles (what this demonstrates)

- **DOM rendering without a framework** — a small state object + a single
  `render()` that rebuilds the view; event delegation instead of per-node listeners.
- **Hand-drawn charts** — donut via SVG `stroke-dasharray`, line/area via
  `polyline`/`polygon`, bars and heatmap in CSS. No chart library.
- **XSS-safe rendering** — every value from the API is HTML-escaped (`esc`) and
  every URL is scheme-validated (`safeUrl` blocks `javascript:` / `data:`), because
  raw `innerHTML` does not escape the way a framework would.
- **Async & networking** — `async/await`, `AbortController` to cancel the previous
  in-flight request (no stale-response races), a 15s timeout, and offline handling.
- **API rate limiting** — reads `X-RateLimit-*` headers, shows remaining quota, and
  handles 403 / 429 / 5xx with specific messages.
- **Input hardening** — accepts pasted profile URLs and `@handles`, encodes the API
  path, and caps input length.

## How it works

1. `run(username)` cancels any in-flight request, then fetches the user, their
   repos (up to 100), and recent public events.
2. Pure functions aggregate the responses: language counts, top/recent repos,
   repos-per-year, and a push-events-per-day map.
3. `render()` reads the state object and rebuilds `#app`'s markup; stat numbers
   animate with `requestAnimationFrame` (respecting `prefers-reduced-motion`).
4. Success pushes `?user=…` to the URL so the view is shareable and survives
   refresh and back/forward.

## Honest API notes

The GitHub REST API can't provide two "obvious" charts, so this is honest rather
than faking data:

- **Contribution heatmap** — the full contribution graph is GraphQL-only; this uses
  the public **events** feed (~90 days, public pushes).
- **Follower growth** — GitHub stores no follower history; the trend is built from a
  `localStorage` snapshot saved on each visit (one point on the first visit).

## Files

```
index.html   markup + CSS + all JavaScript (single self-contained file)
```

## Tech

- **Languages:** HTML, CSS, JavaScript (ES2020, no framework)
- **APIs:** GitHub REST API, Fetch, AbortController, History, localStorage,
  `requestAnimationFrame`, SVG
