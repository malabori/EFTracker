// Pure flea-price logic: turns tarkov.dev item records into what the table shows.

const FLEA_IDS = new Set(['flea-market', 'fleaMarket', 'flea market']);

// The older `source` field holds ids like "therapist" or "fleaMarket".
function vendorName(offer) {
  if (offer?.vendor?.name) return offer.vendor.name;
  const source = String(offer?.source || '');
  if (FLEA_IDS.has(source)) return 'Flea Market';
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Trader';
}

function isFleaOffer(offer) {
  return FLEA_IDS.has(offer?.vendor?.normalizedName) || FLEA_IDS.has(offer?.source);
}

const price = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function normalizeItem(raw) {
  // tarkov.dev lists the flea market among the sell offers; the "best trader"
  // must only consider actual traders.
  const traderOffers = (raw.sellFor || [])
    .filter(o => !isFleaOffer(o))
    .map(o => ({ vendor: vendorName(o), price: price(o.priceRUB) }))
    .filter(o => o.price > 0)
    .sort((a, b) => b.price - a.price);
  const bestTrader = traderOffers[0] || null;
  const flea = price(raw.lastLowPrice);
  const slots = Math.max(1, (Number(raw.width) || 1) * (Number(raw.height) || 1));
  const best = Math.max(flea, bestTrader?.price || 0);
  const types = Array.isArray(raw.types) ? raw.types : [];

  let sellTo = null;
  if (flea && bestTrader) sellTo = flea > bestTrader.price ? 'flea' : 'trader';
  else if (flea) sellTo = 'flea';
  else if (bestTrader) sellTo = 'trader';

  return {
    id: String(raw.id),
    name: String(raw.name || 'Unknown item'),
    shortName: raw.shortName || '',
    slug: raw.normalizedName || null,
    icon: raw.iconLink || null,
    wikiLink: raw.wikiLink || null,
    flea,
    avg24h: price(raw.avg24hPrice),
    low24h: price(raw.low24hPrice),
    high24h: price(raw.high24hPrice),
    change48h: Number.isFinite(raw.changeLast48hPercent)
      ? raw.changeLast48hPercent
      : null,
    updated: raw.updated || null,
    noFlea: types.includes('noFlea'),
    bestTrader,
    sellTo,
    slots,
    perSlot: best ? Math.round(best / slots) : 0
  };
}

export const SORT_KEYS = {
  relevance: null,
  flea: item => item.flea,
  avg: item => item.avg24h,
  trader: item => item.bestTrader?.price || 0,
  slot: item => item.perSlot
};

// Highest first; items with no price sink to the bottom. "relevance" keeps
// tarkov.dev's own ordering.
export function sortItems(items, key) {
  const pick = SORT_KEYS[key];
  if (!pick) return items.slice();
  return items
    .map((item, i) => ({ item, i, v: pick(item) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map(x => x.item);
}
