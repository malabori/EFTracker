// Nixie-tube digits, like the Soviet ИН-14 tubes in old instrument panels and
// hobby clocks. Each digit is a thin glowing wire (an SVG path); behind it the
// other nine cathodes show faintly through the glass, as in a real tube.
const DIGITS = {
  0: 'M10 3C14 3 16.5 8.5 16.5 16S14 29 10 29 3.5 23.5 3.5 16 6 3 10 3Z',
  1: 'M6.8 7.6 11 3V29',
  2: 'M4 8.6C4.6 5 7 3 10.2 3 13.8 3 16.2 5.6 16.2 9 16.2 11.8 14.8 13.8 12.6 16.2L3.8 29H16.5',
  3: 'M4.2 3H16L10 12.6C14.2 12.6 16.6 15.6 16.6 20.4 16.6 25.6 13.8 29 9.8 29 7 29 4.9 27.6 3.6 25.3',
  4: 'M13.4 29V3L3.4 20.6H17',
  5: 'M15.6 3H6L4.9 14C6.4 12.9 8.2 12.4 10.1 12.4 14.1 12.4 16.6 15.6 16.6 20.6 16.6 25.7 13.7 29 9.7 29 7 29 4.9 27.7 3.7 25.4',
  6: 'M14.6 4.6C13.4 3.5 12 3 10.4 3 6.1 3 3.6 8.2 3.6 17.2 3.6 25 6.3 29 10.1 29 13.9 29 16.5 25.9 16.5 21.4 16.5 17 13.9 14.2 10.2 14.2 7.4 14.2 5 15.8 3.7 18.6',
  7: 'M3.6 3H16.5L8.6 29',
  8: 'M10 15.4C6.9 15.4 4.6 12.8 4.6 9.2 4.6 5.6 6.9 3 10 3 13.1 3 15.4 5.6 15.4 9.2 15.4 12.8 13.1 15.4 10 15.4ZM10 15.4C6.1 15.4 3.5 18.3 3.5 22.2 3.5 26.1 6.2 29 10 29 13.8 29 16.5 26.1 16.5 22.2 16.5 18.3 13.9 15.4 10 15.4Z',
  9: 'M5.4 27.4C6.6 28.5 8 29 9.6 29 13.9 29 16.4 23.8 16.4 14.8 16.4 7 13.7 3 9.9 3 6.1 3 3.5 6.1 3.5 10.6 3.5 15 6.1 17.8 9.8 17.8 12.6 17.8 15 16.2 16.3 13.4'
};

// The unlit cathodes, used as each tube's background (see .tube in theme.css).
export const GHOST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 32" fill="none" stroke="#5e2e15" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round" opacity=".5">${Object.values(
  DIGITS
)
  .map(d => `<path d="${d}"/>`)
  .join('')}</svg>`;

export function installNixieGhost(root = document.documentElement) {
  root.style.setProperty(
    '--nixie-ghost',
    `url("data:image/svg+xml,${encodeURIComponent(GHOST_SVG)}")`
  );
}

// Markup for a row of tubes showing `text`: digits light up, ':' becomes a
// pair of neon dots, anything else is a dark tube. The caller labels the
// whole readout for screen readers; the tubes themselves are decoration.
export function nixieHtml(text) {
  return [...String(text)]
    .map(ch => {
      if (ch === ':') return '<span class="nixie-colon" aria-hidden="true"></span>';
      const d = DIGITS[ch];
      return d
        ? `<span class="tube" aria-hidden="true"><svg viewBox="0 0 20 32"><path d="${d}"/></svg></span>`
        : '<span class="tube is-dark" aria-hidden="true"></span>';
    })
    .join('');
}
