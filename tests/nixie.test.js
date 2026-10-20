import { describe, it, expect } from 'vitest';
import { GHOST_SVG, nixieHtml } from '../src/shared/nixie.js';

const count = (html, needle) => html.split(needle).length - 1;

describe('nixie tubes', () => {
  it('lights one tube per digit', () => {
    const html = nixieHtml('037');
    expect(count(html, 'class="tube"')).toBe(3);
    expect(count(html, '<path d="M')).toBe(3);
  });

  it('turns ":" into neon dots and anything else into a dark tube', () => {
    const html = nixieHtml('09:2-');
    expect(count(html, 'nixie-colon')).toBe(1);
    expect(count(html, 'class="tube"')).toBe(3);
    expect(count(html, 'tube is-dark')).toBe(1);
  });

  it('hides every tube from screen readers', () => {
    const html = nixieHtml('12:34');
    expect(count(html, 'aria-hidden="true"')).toBe(5);
  });

  it('shows all ten unlit cathodes behind each digit', () => {
    expect(count(GHOST_SVG, '<path ')).toBe(10);
  });
});
