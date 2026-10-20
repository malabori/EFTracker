import { gqlFirstAccepted } from '../shared/api.js';

export const ITEM_QUERY = `query EftrackingFlea($name: String!, $mode: GameMode) {
  items(name: $name, limit: 40, gameMode: $mode) {
    id name shortName normalizedName iconLink wikiLink width height types
    avg24hPrice lastLowPrice low24hPrice high24hPrice changeLast48hPercent updated
    sellFor { priceRUB vendor { name normalizedName } }
  }
}`;

// What the previous version of the page requested, kept as a fallback.
const BASIC_ITEM_QUERY = `query EftrackingFleaBasic($name: String!, $mode: GameMode) {
  items(name: $name, limit: 40, gameMode: $mode) {
    id name shortName iconLink wikiLink avg24hPrice lastLowPrice low24hPrice high24hPrice updated
    sellFor { source priceRUB }
  }
}`;

export async function searchItems(name, mode) {
  const { data } = await gqlFirstAccepted([ITEM_QUERY, BASIC_ITEM_QUERY], { name, mode });
  return (Array.isArray(data.items) ? data.items : []).filter(Boolean);
}
