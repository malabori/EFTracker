// Tarkov's raid clock runs 7x real time, anchored to Moscow time (UTC+3).
// The raid menu always offers two start times 12 hours apart, so there are
// two clocks: the left and right options on the time selection screen.
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = DAY_MS / 2;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const TIME_RATIO = 7;

export function raidTime(nowMs, side = 'left') {
  const offset = MOSCOW_OFFSET_MS + (side === 'right' ? HALF_DAY_MS : 0);
  return new Date((offset + nowMs * TIME_RATIO) % DAY_MS);
}

export function formatClock(date) {
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

// Approximate in-game daylight window, used only for the sun/moon hint.
export function isDaytime(date) {
  const hour = date.getUTCHours();
  return hour >= 5 && hour < 22;
}
