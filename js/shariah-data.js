/*
 * Shariah screening data.
 *
 * status:  "halal"    -> passes business + financial screens (green)
 *          "haram"    -> core business is impermissible: riba, alcohol, music,
 *                        gambling, tobacco, pork, conventional insurance (red)
 *          "doubtful" -> screeners disagree / borderline ratios (amber)
 *
 * revenue: approximate breakdown of where the company's revenue comes from.
 *          `ok: false` marks impermissible income. These are rounded estimates
 *          for illustration -- always confirm with a dedicated screener
 *          (Zoya, Musaffa, IdealRatings, your local scholar) before investing.
 *
 * price:   rough reference price, used only for demo mode when no live API
 *          key is configured.
 */
const SHARIAH_DB = {
  // ---------- Generally compliant ----------
  AAPL: { name: "Apple Inc.", sector: "Technology", status: "halal", price: 230,
    reason: "Hardware & software. Small impermissible share from interest income and music streaming (Apple Music) - purify that portion.",
    revenue: [
      { label: "iPhone, Mac, iPad & wearables", pct: 75, ok: true },
      { label: "Software & cloud services", pct: 22, ok: true },
      { label: "Music & entertainment streaming", pct: 1.8, ok: false },
      { label: "Interest income", pct: 1.2, ok: false } ] },
  MSFT: { name: "Microsoft Corp.", sector: "Technology", status: "halal", price: 430,
    reason: "Cloud, software and devices. Minor interest income.",
    revenue: [
      { label: "Azure & cloud", pct: 43, ok: true },
      { label: "Office & productivity", pct: 32, ok: true },
      { label: "Windows, devices & search", pct: 22.5, ok: true },
      { label: "Interest income", pct: 1.5, ok: false },
      { label: "Other impermissible", pct: 1, ok: false } ] },
  NVDA: { name: "NVIDIA Corp.", sector: "Semiconductors", status: "halal", price: 135,
    reason: "Chip design. Very low debt, small interest income.",
    revenue: [
      { label: "Data center chips", pct: 88, ok: true },
      { label: "Gaming GPUs", pct: 9, ok: true },
      { label: "Automotive & visualization", pct: 2.5, ok: true },
      { label: "Interest income", pct: 0.5, ok: false } ] },
  TSLA: { name: "Tesla Inc.", sector: "Automotive", status: "halal", price: 250,
    reason: "Electric vehicles and energy storage. Some interest from auto financing.",
    revenue: [
      { label: "Vehicle sales", pct: 79, ok: true },
      { label: "Energy generation & storage", pct: 10, ok: true },
      { label: "Services & other", pct: 9.5, ok: true },
      { label: "Interest income", pct: 1.5, ok: false } ] },
  AMD: { name: "Advanced Micro Devices", sector: "Semiconductors", status: "halal", price: 160,
    reason: "Chip design, low debt.",
    revenue: [
      { label: "Data center", pct: 48, ok: true },
      { label: "Client CPUs", pct: 28, ok: true },
      { label: "Gaming & embedded", pct: 23, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  ASML: { name: "ASML Holding", sector: "Semiconductors", status: "halal", price: 750,
    reason: "Lithography equipment manufacturer.",
    revenue: [
      { label: "Lithography systems", pct: 76, ok: true },
      { label: "Installed base services", pct: 23, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  TSM: { name: "Taiwan Semiconductor", sector: "Semiconductors", status: "halal", price: 190,
    reason: "Contract chip manufacturing.",
    revenue: [
      { label: "Wafer manufacturing", pct: 97.5, ok: true },
      { label: "Interest income", pct: 2.5, ok: false } ] },
  ADBE: { name: "Adobe Inc.", sector: "Technology", status: "halal", price: 500,
    reason: "Creative & document software.",
    revenue: [
      { label: "Creative & document cloud", pct: 74, ok: true },
      { label: "Digital experience", pct: 25, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  CRM: { name: "Salesforce Inc.", sector: "Technology", status: "halal", price: 290,
    reason: "Business software (CRM).",
    revenue: [
      { label: "Subscription software", pct: 94, ok: true },
      { label: "Professional services", pct: 5, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  META: { name: "Meta Platforms", sector: "Technology", status: "halal", price: 580,
    reason: "Social platforms and ads. Some ads and content are impermissible - purify.",
    revenue: [
      { label: "Advertising (permissible)", pct: 93, ok: true },
      { label: "Reality Labs hardware", pct: 2, ok: true },
      { label: "Impermissible ads / content", pct: 3.5, ok: false },
      { label: "Interest income", pct: 1.5, ok: false } ] },
  JNJ: { name: "Johnson & Johnson", sector: "Healthcare", status: "halal", price: 160,
    reason: "Pharmaceuticals and medical devices.",
    revenue: [
      { label: "Pharmaceuticals", pct: 63, ok: true },
      { label: "Medical technology", pct: 36, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  LLY: { name: "Eli Lilly", sector: "Healthcare", status: "halal", price: 850,
    reason: "Pharmaceuticals.",
    revenue: [
      { label: "Pharmaceuticals", pct: 99.5, ok: true },
      { label: "Interest income", pct: 0.5, ok: false } ] },
  PFE: { name: "Pfizer Inc.", sector: "Healthcare", status: "halal", price: 28,
    reason: "Pharmaceuticals. Watch debt ratio.",
    revenue: [
      { label: "Pharmaceuticals & vaccines", pct: 98.5, ok: true },
      { label: "Interest income", pct: 1.5, ok: false } ] },
  XOM: { name: "Exxon Mobil", sector: "Energy", status: "halal", price: 115,
    reason: "Oil & gas, low debt.",
    revenue: [
      { label: "Upstream oil & gas", pct: 40, ok: true },
      { label: "Refining & chemicals", pct: 59, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  CVX: { name: "Chevron Corp.", sector: "Energy", status: "halal", price: 155,
    reason: "Oil & gas, low debt.",
    revenue: [
      { label: "Oil & gas", pct: 99, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  PG: { name: "Procter & Gamble", sector: "Consumer goods", status: "halal", price: 170,
    reason: "Household products.",
    revenue: [
      { label: "Household & personal care", pct: 99.5, ok: true },
      { label: "Interest income", pct: 0.5, ok: false } ] },
  KO: { name: "Coca-Cola Co.", sector: "Beverages (non-alcoholic)", status: "halal", price: 65,
    reason: "Soft drinks. Small alcohol-based ready-to-drink line in some markets.",
    revenue: [
      { label: "Soft drinks, water, juice", pct: 97, ok: true },
      { label: "Alcoholic ready-to-drink", pct: 1.5, ok: false },
      { label: "Interest income", pct: 1.5, ok: false } ] },
  PEP: { name: "PepsiCo", sector: "Beverages & snacks", status: "halal", price: 165,
    reason: "Snacks and soft drinks.",
    revenue: [
      { label: "Snacks & foods", pct: 58, ok: true },
      { label: "Beverages", pct: 41, ok: true },
      { label: "Interest income", pct: 1, ok: false } ] },
  NKE: { name: "Nike Inc.", sector: "Apparel", status: "halal", price: 80,
    reason: "Footwear & apparel.",
    revenue: [
      { label: "Footwear & apparel", pct: 98.5, ok: true },
      { label: "Interest income", pct: 1.5, ok: false } ] },
  HD: { name: "Home Depot", sector: "Retail", status: "doubtful", price: 390,
    reason: "Permissible business, but debt ratio is near or above the 33% screen.",
    revenue: [
      { label: "Home improvement retail", pct: 99.5, ok: true },
      { label: "Interest income", pct: 0.5, ok: false } ] },
  SHOP: { name: "Shopify Inc.", sector: "Technology", status: "halal", price: 100,
    reason: "E-commerce software. Merchant cash advances carry some interest.",
    revenue: [
      { label: "Subscriptions & payments", pct: 96, ok: true },
      { label: "Merchant lending / interest", pct: 4, ok: false } ] },

  // ---------- Islamic ETFs ----------
  SPUS: { name: "SP Funds S&P 500 Sharia ETF", sector: "Islamic ETF", status: "halal", price: 45,
    reason: "Shariah-screened S&P 500 fund (AAOIFI standards).",
    revenue: [ { label: "Screened compliant holdings", pct: 100, ok: true } ] },
  HLAL: { name: "Wahed FTSE USA Shariah ETF", sector: "Islamic ETF", status: "halal", price: 55,
    reason: "Shariah-screened US equity fund.",
    revenue: [ { label: "Screened compliant holdings", pct: 100, ok: true } ] },
  UMMA: { name: "Wahed Dow Jones Islamic World ETF", sector: "Islamic ETF", status: "halal", price: 25,
    reason: "Shariah-screened global ex-US fund.",
    revenue: [ { label: "Screened compliant holdings", pct: 100, ok: true } ] },
  SPRE: { name: "SP Funds Global REIT Sharia ETF", sector: "Islamic ETF", status: "halal", price: 21,
    reason: "Shariah-screened real estate fund.",
    revenue: [ { label: "Screened compliant REITs", pct: 100, ok: true } ] },
  SPSK: { name: "SP Funds Dow Jones Global Sukuk ETF", sector: "Islamic ETF", status: "halal", price: 18,
    reason: "Sukuk (Islamic bonds) - asset-backed, no riba.",
    revenue: [ { label: "Sukuk profit income", pct: 100, ok: true } ] },

  // ---------- Doubtful / mixed ----------
  AMZN: { name: "Amazon.com Inc.", sector: "Retail & cloud", status: "doubtful", price: 190,
    reason: "Sells alcohol and streams music/video; screeners disagree.",
    revenue: [
      { label: "Online & physical stores", pct: 40, ok: true },
      { label: "AWS cloud", pct: 17, ok: true },
      { label: "Seller services & ads", pct: 32, ok: true },
      { label: "Music, video & alcohol sales", pct: 9, ok: false },
      { label: "Interest income", pct: 2, ok: false } ] },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology", status: "doubtful", price: 170,
    reason: "YouTube music/entertainment and some ad categories are impermissible; screeners disagree.",
    revenue: [
      { label: "Search & ads", pct: 57, ok: true },
      { label: "Google Cloud", pct: 12, ok: true },
      { label: "Subscriptions, devices & other", pct: 17, ok: true },
      { label: "YouTube music & entertainment", pct: 11, ok: false },
      { label: "Interest income", pct: 3, ok: false } ] },
  V: { name: "Visa Inc.", sector: "Payments", status: "doubtful", price: 290,
    reason: "Fee-based payment network, but it facilitates interest-bearing credit cards.",
    revenue: [
      { label: "Payment processing fees", pct: 85, ok: true },
      { label: "Credit-card related (riba facilitation)", pct: 13, ok: false },
      { label: "Interest income", pct: 2, ok: false } ] },
  MA: { name: "Mastercard Inc.", sector: "Payments", status: "doubtful", price: 500,
    reason: "Fee-based payment network, but it facilitates interest-bearing credit cards.",
    revenue: [
      { label: "Payment processing fees", pct: 85, ok: true },
      { label: "Credit-card related (riba facilitation)", pct: 13, ok: false },
      { label: "Interest income", pct: 2, ok: false } ] },
  COST: { name: "Costco Wholesale", sector: "Retail", status: "doubtful", price: 900,
    reason: "Sells alcohol, tobacco and pork alongside permissible goods.",
    revenue: [
      { label: "Permissible merchandise", pct: 92, ok: true },
      { label: "Alcohol, tobacco & pork", pct: 7, ok: false },
      { label: "Interest income", pct: 1, ok: false } ] },
  WMT: { name: "Walmart Inc.", sector: "Retail", status: "doubtful", price: 80,
    reason: "Sells alcohol, tobacco and pork alongside permissible goods.",
    revenue: [
      { label: "Permissible merchandise", pct: 93, ok: true },
      { label: "Alcohol, tobacco & pork", pct: 6, ok: false },
      { label: "Interest income", pct: 1, ok: false } ] },
  MCD: { name: "McDonald's Corp.", sector: "Restaurants", status: "doubtful", price: 300,
    reason: "Debt far above the 33% screen; pork products on the menu.",
    revenue: [
      { label: "Franchise & restaurant sales", pct: 94, ok: true },
      { label: "Pork products", pct: 5, ok: false },
      { label: "Interest income", pct: 1, ok: false } ] },

  // ---------- Non-compliant: riba (interest / conventional finance) ----------
  JPM: { name: "JPMorgan Chase", sector: "Banking", status: "haram", price: 220,
    reason: "Conventional bank - core income is riba (interest).",
    revenue: [
      { label: "Net interest income (riba)", pct: 55, ok: false },
      { label: "Investment banking & trading", pct: 30, ok: false },
      { label: "Fees & asset management", pct: 15, ok: false } ] },
  BAC: { name: "Bank of America", sector: "Banking", status: "haram", price: 42,
    reason: "Conventional bank - core income is riba (interest).",
    revenue: [
      { label: "Net interest income (riba)", pct: 56, ok: false },
      { label: "Trading & investment banking", pct: 24, ok: false },
      { label: "Fees & wealth management", pct: 20, ok: false } ] },
  WFC: { name: "Wells Fargo", sector: "Banking", status: "haram", price: 60,
    reason: "Conventional bank - core income is riba (interest).",
    revenue: [
      { label: "Net interest income (riba)", pct: 60, ok: false },
      { label: "Fees & other", pct: 40, ok: false } ] },
  C: { name: "Citigroup", sector: "Banking", status: "haram", price: 65,
    reason: "Conventional bank - core income is riba (interest).",
    revenue: [
      { label: "Net interest income (riba)", pct: 60, ok: false },
      { label: "Fees & trading", pct: 40, ok: false } ] },
  GS: { name: "Goldman Sachs", sector: "Banking", status: "haram", price: 500,
    reason: "Investment bank - interest, leveraged trading.",
    revenue: [
      { label: "Trading & investment banking", pct: 60, ok: false },
      { label: "Interest income (riba)", pct: 25, ok: false },
      { label: "Asset management fees", pct: 15, ok: false } ] },
  MS: { name: "Morgan Stanley", sector: "Banking", status: "haram", price: 110,
    reason: "Investment bank - interest, leveraged trading.",
    revenue: [
      { label: "Wealth management", pct: 45, ok: false },
      { label: "Trading & investment banking", pct: 40, ok: false },
      { label: "Interest income (riba)", pct: 15, ok: false } ] },
  "BRK.B": { name: "Berkshire Hathaway", sector: "Insurance & conglomerate", status: "haram", price: 450,
    reason: "Large conventional insurance arm plus stakes in banks.",
    revenue: [
      { label: "Conventional insurance", pct: 30, ok: false },
      { label: "Bank & finance holdings", pct: 10, ok: false },
      { label: "Railroad, energy & manufacturing", pct: 60, ok: true } ] },
  UNH: { name: "UnitedHealth Group", sector: "Insurance", status: "haram", price: 550,
    reason: "Conventional health insurance.",
    revenue: [
      { label: "Conventional health insurance", pct: 75, ok: false },
      { label: "Health services (Optum)", pct: 25, ok: true } ] },

  // ---------- Non-compliant: music & entertainment ----------
  SPOT: { name: "Spotify Technology", sector: "Music streaming", status: "haram", price: 380,
    reason: "Core business is music streaming.",
    revenue: [
      { label: "Music streaming subscriptions", pct: 88, ok: false },
      { label: "Music & podcast ads", pct: 12, ok: false } ] },
  WMG: { name: "Warner Music Group", sector: "Music", status: "haram", price: 32,
    reason: "Record label & music publishing.",
    revenue: [
      { label: "Recorded music", pct: 83, ok: false },
      { label: "Music publishing", pct: 17, ok: false } ] },
  SIRI: { name: "Sirius XM", sector: "Music radio", status: "haram", price: 25,
    reason: "Satellite music radio and Pandora.",
    revenue: [
      { label: "Music radio subscriptions", pct: 78, ok: false },
      { label: "Advertising", pct: 22, ok: false } ] },
  LYV: { name: "Live Nation Entertainment", sector: "Concerts", status: "haram", price: 110,
    reason: "Concerts and ticketing for music events.",
    revenue: [
      { label: "Concerts", pct: 85, ok: false },
      { label: "Ticketing & sponsorship", pct: 15, ok: false } ] },
  DIS: { name: "Walt Disney Co.", sector: "Entertainment", status: "haram", price: 95,
    reason: "Film, music, TV entertainment; alcohol sold at parks.",
    revenue: [
      { label: "Film, TV & streaming entertainment", pct: 55, ok: false },
      { label: "Parks & experiences", pct: 35, ok: false },
      { label: "Sports (ESPN)", pct: 10, ok: true } ] },
  NFLX: { name: "Netflix Inc.", sector: "Entertainment", status: "haram", price: 700,
    reason: "Film/TV & music entertainment streaming.",
    revenue: [
      { label: "Entertainment streaming", pct: 99, ok: false },
      { label: "Interest income", pct: 1, ok: false } ] },
  WBD: { name: "Warner Bros. Discovery", sector: "Entertainment", status: "haram", price: 9,
    reason: "Film, TV & music entertainment; very high debt.",
    revenue: [
      { label: "Studios & networks", pct: 70, ok: false },
      { label: "Streaming", pct: 30, ok: false } ] },

  // ---------- Non-compliant: alcohol ----------
  BUD: { name: "Anheuser-Busch InBev", sector: "Alcohol", status: "haram", price: 60,
    reason: "Brewer - core business is alcohol.",
    revenue: [ { label: "Beer", pct: 95, ok: false }, { label: "Non-alcoholic drinks", pct: 5, ok: true } ] },
  STZ: { name: "Constellation Brands", sector: "Alcohol", status: "haram", price: 240,
    reason: "Beer, wine & spirits.",
    revenue: [ { label: "Beer", pct: 80, ok: false }, { label: "Wine & spirits", pct: 20, ok: false } ] },
  DEO: { name: "Diageo plc", sector: "Alcohol", status: "haram", price: 130,
    reason: "Spirits & beer (Johnnie Walker, Guinness).",
    revenue: [ { label: "Spirits", pct: 80, ok: false }, { label: "Beer", pct: 17, ok: false }, { label: "Other", pct: 3, ok: true } ] },
  TAP: { name: "Molson Coors", sector: "Alcohol", status: "haram", price: 55,
    reason: "Brewer - core business is alcohol.",
    revenue: [ { label: "Beer", pct: 97, ok: false }, { label: "Non-alcoholic drinks", pct: 3, ok: true } ] },
  SAM: { name: "Boston Beer Co.", sector: "Alcohol", status: "haram", price: 280,
    reason: "Brewer - core business is alcohol.",
    revenue: [ { label: "Beer, seltzer & cider", pct: 100, ok: false } ] },

  // ---------- Non-compliant: tobacco, gambling, pork ----------
  MO: { name: "Altria Group", sector: "Tobacco", status: "haram", price: 52,
    reason: "Cigarettes and tobacco products.",
    revenue: [ { label: "Tobacco", pct: 99, ok: false }, { label: "Other", pct: 1, ok: false } ] },
  PM: { name: "Philip Morris Intl.", sector: "Tobacco", status: "haram", price: 125,
    reason: "Cigarettes and tobacco products.",
    revenue: [ { label: "Tobacco & nicotine", pct: 100, ok: false } ] },
  LVS: { name: "Las Vegas Sands", sector: "Gambling", status: "haram", price: 50,
    reason: "Casinos (maysir / gambling).",
    revenue: [ { label: "Casino gaming", pct: 75, ok: false }, { label: "Hotels & malls", pct: 25, ok: false } ] },
  MGM: { name: "MGM Resorts", sector: "Gambling", status: "haram", price: 40,
    reason: "Casinos (maysir / gambling) and alcohol.",
    revenue: [ { label: "Casino gaming", pct: 60, ok: false }, { label: "Hotels, food & beverage", pct: 40, ok: false } ] },
  DKNG: { name: "DraftKings", sector: "Gambling", status: "haram", price: 40,
    reason: "Online sports betting and casino.",
    revenue: [ { label: "Sports betting & iGaming", pct: 100, ok: false } ] },
  TSN: { name: "Tyson Foods", sector: "Food", status: "haram", price: 60,
    reason: "Significant pork processing; conventional (non-zabiha) slaughter.",
    revenue: [
      { label: "Chicken & prepared foods", pct: 55, ok: true },
      { label: "Beef (non-zabiha)", pct: 32, ok: false },
      { label: "Pork", pct: 13, ok: false } ] },
};

/* Keyword rules for tickers that aren't in the curated list. Matched against
 * the company name and industry returned by the price API. First match wins. */
const SHARIAH_RULES = [
  { re: /\b(bank|bancorp|banc|financial|credit|lending|mortgage|capital one|savings)\b/i, status: "haram", why: "Conventional finance - riba (interest)" },
  { re: /\binsurance|assurance|reinsurance\b/i, status: "haram", why: "Conventional insurance (gharar / riba)" },
  { re: /\b(music|records|radio|concert|entertainment|media|studios|film|broadcast)\b/i, status: "haram", why: "Music & entertainment" },
  { re: /\b(brew|brewing|beer|wine|winery|spirits|distill|liquor|alcohol)\b/i, status: "haram", why: "Alcohol" },
  { re: /\b(tobacco|cigar|cigarette|vape|cannabis)\b/i, status: "haram", why: "Tobacco / intoxicants" },
  { re: /\b(casino|gaming|gambling|betting|lottery|resorts)\b/i, status: "haram", why: "Gambling (maysir)" },
  { re: /\b(pork|hog|swine)\b/i, status: "haram", why: "Pork" },
  { re: /\b(defense|weapons|firearms)\b/i, status: "doubtful", why: "Weapons - scholars differ" },
  { re: /\b(beverages|hotels|restaurants|leisure|real estate|reit|retail)\b/i, status: "doubtful", why: "Sector may include impermissible income - review manually" },
];

/* Classic AAOIFI-style financial thresholds, shown in the details panel. */
const SHARIAH_THRESHOLDS = [
  { label: "Impermissible revenue", limit: "< 5% of total revenue" },
  { label: "Interest-bearing debt", limit: "< 30-33% of market cap" },
  { label: "Cash & interest-bearing securities", limit: "< 30-33% of market cap" },
  { label: "Receivables", limit: "< 49% of market cap" },
];

/* Look up a ticker. Returns a screening record; unknown tickers are classified
 * by keyword using whatever name/industry is available. */
function screenStock(symbol, name, industry) {
  const sym = symbol.toUpperCase();
  const known = SHARIAH_DB[sym];
  if (known) return { symbol: sym, source: "curated", ...known };

  const text = `${name || ""} ${industry || ""}`;
  for (const rule of SHARIAH_RULES) {
    if (rule.re.test(text)) {
      return { symbol: sym, name: name || sym, sector: industry || "Unknown",
        status: rule.status, source: "auto", reason: `Auto-classified: ${rule.why}. Verify before investing.`,
        revenue: null };
    }
  }
  return { symbol: sym, name: name || sym, sector: industry || "Unknown",
    status: industry ? "halal" : "doubtful", source: "auto",
    reason: industry
      ? `Auto-classified from industry "${industry}" - no impermissible keywords found. Verify debt & revenue ratios with a screener.`
      : "Not in the built-in list and no industry data yet. Verify with a screener and set the status manually.",
    revenue: null };
}

function impermissiblePct(record) {
  if (!record || !record.revenue) return null;
  return record.revenue.filter(r => !r.ok).reduce((s, r) => s + r.pct, 0);
}
