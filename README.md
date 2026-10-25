# Sharee'ah Stock Tracker

A Shariah-compliant investment and income dashboard. It runs entirely in the browser: no server, no build step.

## Features

- **Portfolio tracking**: add a stock and the amount you invested. The app works out your shares and shows live value, today's change, and profit/loss.
- **Shariah status on every stock**: halal stocks are **green**, non-compliant ones are **red** (riba/interest, alcohol, music and entertainment, gambling, tobacco, pork, conventional insurance), and stocks scholars disagree on are **amber**.
- **Allocation donut**: shows what % of your portfolio each stock makes up, colored by compliance. You can also group it by compliance status.
- **Company breakdown donut**: click any stock to see what % of the company's revenue comes from permissible vs. impermissible sources, checked against the 5% limit, plus the purification percentage.
- **Growth & loss chart**: your portfolio value against the amount you put in, over 1M to All time. You can view the whole portfolio or one stock, with a return-by-stock bar chart.
- **Gold & Silver tab**: price per gram, tola or ounce for 24k, 22k, 21k, 18k, 14k and 10k gold and 999 to 800 silver, with a price chart, today's and 1-year change, and today's nisab (one click sets it in the Zakat calculator).
- **Selling and profit/loss over time**: record sales (average-cost method) and see realized profit, open profit, total sold, and a total profit/loss chart with a sales history.
- **Import trades**: load a Robinhood account activity CSV (or any broker CSV with date, symbol, type, quantity and price). Buys, sells and dividends come in without any login.
- **Two looks**: Onyx (black, the default) and Forest (classic). Switch in Settings → Appearance.
- **Live prices** through [Finnhub](https://finnhub.io/register) (free API key: REST quotes plus a WebSocket trade stream). Without a key the app uses simulated demo prices, and the header says so.
- **Income and Zakat**: log income (salary, business, dividends). Dividends linked to a stock work out the amount to give to charity for purification. Includes a Zakat calculator (2.5% above nisab).
- **Screener**: browse about 60 well-known stocks and Islamic ETFs, or check any ticker. Tickers not in the list are auto-classified from their company name and industry.
- You can override any stock's status yourself. Data is saved in your browser, with export and import of a backup.

## Real Shariah ratios (updates itself)

`.github/workflows/shariah-data.yml` runs every night on GitHub's servers. It runs `scripts/build-shariah-data.mjs`, which downloads each company's official SEC filings, computes the AAOIFI-style financial screens (interest income, debt, cash and receivables ratios), and commits `data/shariah-ratios.json`. The site reads that file, so stock pages show real ratios with a link to the filing. Interest income in the halal/haram ratio comes from the filing; music, alcohol and similar income stay estimates.

Optional repository secrets (Settings → Secrets and variables → Actions): `FINNHUB_KEY` for more reliable market values, and `SEC_USER_AGENT` (for example `Your Name you@example.com`), which the SEC asks for. Run it by hand from the Actions tab with **Run workflow**. Add more tickers in `data/extra-symbols.json` (a JSON list).

## Login and sync

Log in (Settings → Account & sync, or the button at the top right) to save everything to your account through Firebase: portfolio, sales, income, settings, API keys and the chosen look. It then appears on every device you log in on and updates live. Firestore security rules allow each account to read and write only `users/<its id>`. Logging out clears the device's copy. The Firebase settings in `js/firebase-config.js` are public identifiers, not secrets.

## Run it

Open `index.html` in a browser, or host the folder on GitHub Pages (Settings → Pages → deploy from branch).

For live data, open **Settings** and paste two free API keys:

- [Finnhub](https://finnhub.io/register) for live stock prices (streams during market hours, refreshes every minute)
- [Twelve Data](https://twelvedata.com/register) for daily price history (growth chart) and gold/silver prices (refresh every 10 minutes)

Everything runs in your browser while the page is open. No server or connector is needed, and when you reopen the page it fetches the latest prices.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout |
| `css/styles.css` | Styles (light and dark mode, mobile) |
| `js/shariah-data.js` | Built-in compliance list, revenue breakdowns, keyword rules |
| `js/prices.js` | Finnhub live feed plus demo simulator |
| `js/history.js` | Twelve Data price history and gold/silver, demo fallback |
| `js/charts.js` | SVG donut chart |
| `js/app.js` | App logic |

## Disclaimer

The compliance classifications and revenue breakdowns are approximate estimates for guidance only. They are not a fatwa or financial advice. Verify with a dedicated screener (Zoya, Musaffa, IdealRatings) or a qualified scholar before investing.
