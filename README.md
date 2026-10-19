# Sharee'ah Stock Tracker

A Shariah-compliant investment and income dashboard. It runs entirely in the browser: no server, no build step.

## Features

- **Portfolio tracking**: add a stock and the amount you invested. The app works out your shares and shows live value, today's change, and profit/loss.
- **Shariah status on every stock**: halal stocks are **green**, non-compliant ones are **red** (riba/interest, alcohol, music and entertainment, gambling, tobacco, pork, conventional insurance), and stocks scholars disagree on are **amber**.
- **Allocation donut**: shows what % of your portfolio each stock makes up, colored by compliance. You can also group it by compliance status.
- **Company breakdown donut**: click any stock to see what % of the company's revenue comes from permissible vs. impermissible sources, checked against the 5% limit, plus the purification percentage.
- **Growth & loss chart**: your portfolio value against the amount you put in, over 1M to All time. You can view the whole portfolio or one stock, with a return-by-stock bar chart.
- **Gold & Silver tab**: price per gram, tola or ounce for 24k, 22k, 21k, 18k, 14k and 10k gold and 999 to 800 silver, with a price chart, today's and 1-year change, and today's nisab (one click sets it in the Zakat calculator).
- **Live prices** through [Finnhub](https://finnhub.io/register) (free API key: REST quotes plus a WebSocket trade stream). Without a key the app uses simulated demo prices, and the header says so.
- **Income and Zakat**: log income (salary, business, dividends). Dividends linked to a stock work out the amount to give to charity for purification. Includes a Zakat calculator (2.5% above nisab).
- **Screener**: browse about 60 well-known stocks and Islamic ETFs, or check any ticker. Tickers not in the list are auto-classified from their company name and industry.
- You can override any stock's status yourself. Data is saved in your browser, with export and import of a backup.

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
