// HTML builders for the quest ledger. Every value from the API or the player
// goes through esc()/highlight() before it reaches the page.
import { esc, highlight } from '../shared/html.js';
import { count } from '../shared/format.js';
import { nixieHtml } from '../shared/nixie.js';

// Trader names as the Russian version of the game shows them.
const TRADER_RU = {
  Prapor: 'Прапор',
  Therapist: 'Терапевт',
  Fence: 'Скупщик',
  Skier: 'Лыжник',
  Peacekeeper: 'Миротворец',
  Mechanic: 'Механик',
  Ragman: 'Барахольщик',
  Jaeger: 'Егерь',
  Ref: 'Реф',
  Lightkeeper: 'Смотритель',
  'BTR Driver': 'Водитель БТР'
};

const TAB_LABEL = {
  available: 'Available',
  locked: 'Locked',
  completed: 'Done',
  all: 'All'
};
const STATE_WORD = { available: 'available', locked: 'locked', completed: 'done' };

const ru = (text, cls) =>
  text ? `<span class="${cls}" lang="ru" aria-hidden="true">${esc(text)}</span>` : '';

// ---------------------------------------------------------------- Kappa

// Unlit tubes until the data arrives.
export function kappaReadoutHtml(kappa) {
  if (!kappa) {
    return `<span class="nixie nixie-lg">${nixieHtml('---')}</span><span class="kappa-total">/ ---</span>`;
  }
  const { done, total } = kappa;
  if (!total) return '<span class="kappa-none">No Kappa data</span>';
  const digits = String(done).padStart(Math.max(3, String(total).length), '0');
  return `<span class="nixie nixie-lg">${nixieHtml(digits)}</span><span class="kappa-total">/ ${count(total)}</span>`;
}

export function kappaStatsHtml(s) {
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return [
    stat('Left', s.kappa.total ? count(s.kappa.total - s.kappa.done) : '—'),
    stat('All done', `${count(s.all.done)}<small>/${count(s.all.total)}</small>`),
    stat('Ready', count(s.available))
  ].join('');
}

export function tabLabel(tab, n) {
  return `${TAB_LABEL[tab]}<span class="count">${count(n)}</span>`;
}

// ---------------------------------------------------------------- traders

function photoHtml(trader, ctx, cls = 'trader-photo') {
  const img = ctx.traderImages.get(trader);
  return `<span class="${cls}" aria-hidden="true">${esc(trader.charAt(0))}${
    img
      ? `<img src="${esc(img)}" alt="" width="40" height="40" loading="lazy" decoding="async" onerror="this.remove()">`
      : ''
  }</span>`;
}

const ALL_ICON =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="1" width="7" height="7"/><rect x="10" y="1" width="7" height="7"/><rect x="1" y="10" width="7" height="7"/><rect x="10" y="10" width="7" height="7"/></svg>';

// One entry per trader, built once per data load; main.js keeps the pressed
// state and progress current so the portraits aren't re-created on clicks.
export function traderIndexHtml(traders, ctx) {
  const entry = (value, photo, name, ruName) =>
    `<button type="button" class="trader" data-trader="${esc(value)}" aria-pressed="false">${photo}<span class="trader-text"><span class="trader-name">${esc(name)}</span>${ru(ruName, 'trader-ru')}</span><span class="trader-count"></span><span class="trader-bar" aria-hidden="true"><span></span></span></button>`;
  return [
    entry(
      '',
      `<span class="trader-photo is-all" aria-hidden="true">${ALL_ICON}</span>`,
      'All traders',
      'Все торговцы'
    ),
    ...traders.map(t => entry(t, photoHtml(t, ctx), t, TRADER_RU[t]))
  ].join('');
}

export function traderProgressLabel(trader, { done, total }) {
  return `${trader || 'All traders'}: ${count(done)} of ${count(total)} quests done`;
}

// ---------------------------------------------------------------- ledger

function names(ids, ctx, max = 2) {
  const list = ids.map(id => ctx.byId.get(id)?.name).filter(Boolean);
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} +${list.length - max}` : shown;
}

function sublineHtml(task, st, ctx) {
  if (st.state === 'locked') {
    const parts = [];
    if (st.needLevel) parts.push(`level ${st.needLevel}`);
    if (st.missing.length) parts.push(names(st.missing, ctx));
    return `Needs ${esc(parts.join(' · '))}`;
  }
  const objectives = task.objectives;
  if (!objectives.length) return '';
  // While searching, show the objective that matched so it's clear why.
  if (ctx.query && !task.name.toLowerCase().includes(ctx.query)) {
    const hit = objectives.find(o => o.text.toLowerCase().includes(ctx.query));
    if (hit) return highlight(hit.text, ctx.query);
  }
  const first = objectives.find(o => !o.optional) || objectives[0];
  const more =
    objectives.length > 1
      ? ` <span class="sub-more">+${objectives.length - 1}</span>`
      : '';
  return highlight(first.text, ctx.query) + more;
}

function metaHtml(task, st, ctx) {
  const out = [];
  if (st.state === 'completed') out.push(ru('Выполнено', 'mini-stamp'));
  if (task.level > 1 && st.state !== 'completed') {
    out.push(
      `<span class="meta-level${st.needLevel ? ' is-blocking' : ''}">Lvl ${task.level}</span>`
    );
  }
  if (task.maps.length) {
    out.push(
      `<span class="meta-map">${esc(task.maps[0])}${task.maps.length > 1 ? ` +${task.maps.length - 1}` : ''}</span>`
    );
  }
  if (task.kappa)
    out.push('<span class="meta-kappa" title="Required for Kappa">Kappa</span>');
  if (task.faction !== 'Any' && !ctx.faction)
    out.push(`<span class="meta-faction">${task.faction}</span>`);
  return out.join('');
}

function needsHtml(task, ctx) {
  const rows = [];
  if (task.level > 1) {
    const ok = ctx.level == null || ctx.level >= task.level;
    const note =
      ctx.level == null
        ? 'set your level to check'
        : ok
          ? 'met'
          : `you're level ${ctx.level}`;
    rows.push(
      `<li data-ok="${ok}"><span class="lamp" aria-hidden="true"></span><span>Level ${task.level}</span><span class="note">${note}</span></li>`
    );
  }
  for (const req of task.requires) {
    const prereq = ctx.byId.get(req.id);
    if (!prereq) continue;
    if (ctx.faction && prereq.faction !== 'Any' && prereq.faction !== ctx.faction)
      continue;
    const pst = ctx.statuses.get(prereq.id)?.state || 'available';
    const ok = req.status.includes('failed') || pst === 'completed';
    const how = req.status.includes('failed')
      ? 'or fail it'
      : req.status.includes('active')
        ? 'accepting it is enough'
        : STATE_WORD[pst];
    rows.push(
      `<li data-ok="${ok}"><span class="lamp" aria-hidden="true"></span><button type="button" class="link-btn" data-action="jump" data-id="${esc(prereq.id)}">${esc(prereq.name)}</button><span class="note">${esc(prereq.trader)} · ${esc(how)}</span></li>`
    );
  }
  return rows.join('');
}

function moreHtml(task, ctx) {
  const objectives = task.objectives.length
    ? task.objectives
        .map(
          o =>
            `<li><span class="obj-text">${highlight(o.text, ctx.query)}</span>${o.optional ? '<span class="obj-flag">Optional</span>' : ''}${o.maps.length ? `<span class="obj-map">${o.maps.map(esc).join(', ')}</span>` : ''}</li>`
        )
        .join('')
    : '<li><span class="obj-text">No objective details in the data.</span></li>';
  const needs = needsHtml(task, ctx);
  const links = [];
  if (task.wikiLink) {
    links.push(
      `<a href="${esc(task.wikiLink)}" target="_blank" rel="noopener noreferrer">Wiki ↗</a>`
    );
  }
  if (task.slug) {
    links.push(
      `<a href="https://tarkov.dev/task/${esc(encodeURIComponent(task.slug))}" target="_blank" rel="noopener noreferrer">tarkov.dev ↗</a>`
    );
  }
  return `<div class="quest-more" id="more-${esc(task.id)}">
    <div class="more-block">
      <h4 class="plate">${ru('Цели', '')}<span>Objectives</span></h4>
      <ol class="objectives">${objectives}</ol>
    </div>
    ${needs ? `<div class="more-block"><h4 class="plate">${ru('Требуется', '')}<span>Needs</span></h4><ul class="needs">${needs}</ul></div>` : ''}
    ${links.length ? `<p class="more-links">${links.join('')}</p>` : ''}
  </div>`;
}

function rowHtml(task, ctx) {
  const st = ctx.statuses.get(task.id);
  const done = st.state === 'completed';
  const open = ctx.openId === task.id;
  const id = esc(task.id);
  return `<li class="quest${open ? ' is-open' : ''}" data-state="${st.state}" data-id="${id}">
    <span class="lamp" aria-hidden="true"></span>
    <button type="button" class="quest-main" data-action="expand" data-id="${id}" aria-expanded="${open}"${open ? ` aria-controls="more-${id}"` : ''}>
      <span class="quest-name">${highlight(task.name, ctx.query)}</span>
      <span class="quest-sub">${sublineHtml(task, st, ctx)}</span>
    </button>
    <span class="quest-meta">${metaHtml(task, st, ctx)}</span>
    <label class="stampbox${ctx.justStamped === task.id ? ' just-stamped' : ''}">
      <input type="checkbox" class="quest-check" data-action="toggle" data-id="${id}"${done ? ' checked' : ''} aria-label="${esc(task.name)} done">
      <span class="stampbox-mark" aria-hidden="true"></span>
    </label>
    ${open ? moreHtml(task, ctx) : ''}
  </li>`;
}

export function listHtml(groups, ctx) {
  return groups
    .map(group => {
      const totals = ctx.summary.traders.get(group.trader) || { done: 0, total: 0 };
      return `<section class="group">
        <h3 class="group-head">
          ${photoHtml(group.trader, ctx, 'group-photo')}
          <span class="group-name">${esc(group.trader)}</span>
          ${ru(TRADER_RU[group.trader], 'group-ru')}
          <span class="group-count">${count(totals.done)} / ${count(totals.total)} done</span>
        </h3>
        <ol class="quests">${group.tasks.map(t => rowHtml(t, ctx)).join('')}</ol>
      </section>`;
    })
    .join('');
}

export function emptyHtml(tab, counts, hasFilters) {
  if (counts.all === 0) {
    return `<div class="empty"><p>No quests match.</p>${
      hasFilters
        ? '<button type="button" class="btn" data-action="clear-filters">Clear filters</button>'
        : ''
    }</div>`;
  }
  const hints = {
    available: counts.locked
      ? 'Nothing available right now — <strong>Locked</strong> shows what opens up next.'
      : 'Every quest here is done.',
    locked: 'Nothing is locked here.',
    completed: 'Nothing done here yet. Tick a quest off when you finish it.'
  };
  return `<div class="empty"><p>${hints[tab] || 'Nothing to show.'}</p></div>`;
}

export function loadingHtml(failed) {
  return failed
    ? '<div class="empty"><p>Quests couldn’t be loaded. Check your connection, then press Retry.</p></div>'
    : '<div class="loading" aria-hidden="true"><p class="loading-line">Connecting to tarkov.dev<span class="cursor"></span></p>' +
        '<div class="loading-row"></div>'.repeat(7) +
        '</div>';
}
