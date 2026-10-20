import { describe, it, expect } from 'vitest';
import { normalizeItem, sortItems } from '../src/flea/model.js';

const item = (overrides = {}) => ({
  id: 'i1',
  name: 'Graphics card',
  shortName: 'GPU',
  width: 2,
  height: 1,
  lastLowPrice: 300000,
  avg24hPrice: 290000,
  sellFor: [
    { priceRUB: 320000, vendor: { name: 'Flea Market', normalizedName: 'flea-market' } },
    { priceRUB: 200000, vendor: { name: 'Therapist', normalizedName: 'therapist' } },
    { priceRUB: 150000, vendor: { name: 'Mechanic', normalizedName: 'mechanic' } }
  ],
  ...overrides
});

describe('normalizeItem', () => {
  it('never reports the flea market as the best trader', () => {
    const out = normalizeItem(item());
    expect(out.bestTrader).toEqual({ vendor: 'Therapist', price: 200000 });
  });

  it('also recognises the flea market in the older `source` field', () => {
    const out = normalizeItem(
      item({
        sellFor: [
          { source: 'fleaMarket', priceRUB: 999999 },
          { source: 'prapor', priceRUB: 1000 }
        ]
      })
    );
    expect(out.bestTrader).toEqual({ vendor: 'Prapor', price: 1000 });
  });

  it('recommends wherever pays more and values per slot from the better price', () => {
    expect(normalizeItem(item()).sellTo).toBe('flea');
    expect(normalizeItem(item()).perSlot).toBe(150000);
    const cheapOnFlea = normalizeItem(item({ lastLowPrice: 100000 }));
    expect(cheapOnFlea.sellTo).toBe('trader');
    expect(cheapOnFlea.perSlot).toBe(100000);
  });

  it('handles items that cannot be sold on the flea market', () => {
    const out = normalizeItem(item({ lastLowPrice: null, types: ['noFlea'] }));
    expect(out.noFlea).toBe(true);
    expect(out.flea).toBe(0);
    expect(out.sellTo).toBe('trader');
  });

  it('copes with missing prices and sizes', () => {
    const out = normalizeItem({ id: 'x', name: 'Junk', sellFor: [] });
    expect(out).toMatchObject({
      flea: 0,
      bestTrader: null,
      sellTo: null,
      perSlot: 0,
      slots: 1
    });
  });
});

describe('sortItems', () => {
  const items = [
    normalizeItem(item({ id: 'a', lastLowPrice: 10 })),
    normalizeItem(item({ id: 'b', lastLowPrice: 0 })),
    normalizeItem(item({ id: 'c', lastLowPrice: 30 }))
  ];

  it('keeps the API order for best match', () => {
    expect(sortItems(items, 'relevance').map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts highest first with unpriced items last', () => {
    expect(sortItems(items, 'flea').map(i => i.id)).toEqual(['c', 'a', 'b']);
  });
});
