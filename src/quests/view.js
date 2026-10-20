// HTML builders for the quest board. Every value from the API or the player
// goes through esc()/highlight() before it reaches the page.
import { esc, highlight } from '../shared/html.js';
import { count } from '../shared/format.js';
import { requiredObjectives } from './model.js';
import { isObjectiveChecked } from './progress.js';

const STATE_LABEL = { available: 'Available', locked: 'Locked', completed: 'Completed' };
const TAB_LABEL = {
  available: 'Available',
  locked: 'Locked',
  completed: 'Completed',
  all: 'All'
};

const percent = (done, total) => (total ? Math.round((done / total) * 100) : 0);

function meter(label, done, total) {
  return `<div class="meter" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${percent(done, total)}%"></span></div>`;
}

export function summaryHtml(s) {
  const tile = (cls, label, { done, total }) => {
    // Older data copies lack some flags (e.g. Lightkeeper); say so rather than "0".
    if (!total) {
      return `<article class="stat ${cls}">
        <p class="stat-label">${label}</p>
        <p class="stat-value">—</p>
        <p class="stat-sub">Not in this data</p>
      </article>`;
    }
    const left = total - done;
    return `<article class="stat ${cls}">
      <p class="stat-label">${label}</p>
      <p class="stat-value">${count(done)}<span class="stat-total"> / ${count(total)}</span></p>
      ${meter(`${label} progress`, done, total)}
      <p class="stat-sub">${left ? `${count(left)} to go` : 'All done'}</p>
    </article>`;
  };
  return [
    tile('stat-kappa', 'Kappa', s.kappa),
    tile('stat-lk', 'Lightkeeper', s.lightkeeper),
    tile('stat-all', 'All quests', s.all),
    `<article class="stat stat-available">
      <p class="stat-label">Available now</p>
      <p class="stat-value">${count(s.available)}</p>
      <p class="stat-sub">ready to take</p>
    </article>`
  ].join('');
}

export function tabLabel(tab, n) {
  return `${TAB_LABEL[tab]} <span class="count">${count(n)}</span>`;
}

function tagsHtml(task, ctx, st) {
  const tags = [];
  if (task.level > 1) {
    tags.push(
      `<span class="tag tag-level${st.needLevel ? ' is-blocking' : ''}">Lvl ${task.level}</span>`
    );
  }
  if (task.maps.length) {
    for (const m of task.maps.slice(0, 2))
      tags.push(`<span class="tag">${esc(m)}</span>`);
    if (task.maps.length > 2)
      tags.push(`<span class="tag">+${task.maps.length - 2}</span>`);
  } else if (ctx.hasMapData) {
    tags.push('<span class="tag tag-quiet">Any map</span>');
  }
  if (task.kappa)
    tags.push(
      '<span class="tag tag-kappa" title="Required for the Kappa container">Kappa</span>'
    );
  if (task.lightkeeper)
    tags.push(
      '<span class="tag tag-lk" title="Required to unlock Lightkeeper">LK</span>'
    );
  if (task.faction !== 'Any' && !ctx.faction)
    tags.push(`<span class="tag tag-faction">${task.faction}</span>`);
  return tags.join('');
}

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
    return `<span class="lock-icon" aria-hidden="true"></span>Needs ${esc(parts.join(' · '))}`;
  }
  const objectives = task.objectives;
  if (!objectives.length) return '';
  // While searching, show the objective that matched so it's clear why.
  if (ctx.query && !task.name.toLowerCase().includes(ctx.query)) {
    const hit = objectives.find(o => o.text.toLowerCase().includes(ctx.query));
    if (hit) return highlight(hit.text, ctx.query);
  }
  if (st.state === 'available') {
    const required = requiredObjectives(task);
    const done = required.filter(o => ctx.bucket.objectives[o.id]).length;
    const next = required.find(o => !ctx.bucket.objectives[o.id]) || objectives[0];
    const progress = done
      ? `<span class="obj-count">${done}/${required.length}</span> `
      : '';
    return progress + highlight(next.text, ctx.query);
  }
  return highlight(objectives[0].text, ctx.query);
}

function rowHtml(task, ctx) {
  const st = ctx.statuses.get(task.id);
  const done = st.state === 'completed';
  const id = esc(task.id);
  return `<li class="quest" data-state="${st.state}" data-id="${id}"${ctx.selectedId === task.id ? ' aria-current="true"' : ''}>
    <input class="check quest-check" type="checkbox" data-action="toggle" data-id="${id}"${done ? ' checked' : ''} aria-label="${esc(task.name)} complete">
    <button type="button" class="quest-open" data-action="open" data-id="${id}">
      <span class="quest-name">${highlight(task.name, ctx.query)}</span>
      <span class="quest-sub">${sublineHtml(task, st, ctx)}</span>
    </button>
    <span class="quest-tags">${tagsHtml(task, ctx, st)}</span>
  </li>`;
}

// The trader's initial sits under the portrait, so a missing image still reads.
function avatarHtml(trader, ctx) {
  const img = ctx.traderImages.get(trader);
  return `<span class="avatar" aria-hidden="true">${esc(trader.charAt(0))}${
    img
      ? `<img src="${esc(img)}" alt="" width="46" height="46" loading="lazy" decoding="async" onerror="this.remove()">`
      : ''
  }</span>`;
}

const ALL_ICON =
  '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="2"/><rect x="11" y="2" width="7" height="7" rx="2"/><rect x="2" y="11" width="7" height="7" rx="2"/><rect x="11" y="11" width="7" height="7" rx="2"/></svg>';

// One portrait per trader, like the traders screen in-game. Built once per
// data load; main.js keeps the pressed state and progress bars current, so
// the portraits aren't re-created on every click.
export function traderStripHtml(traders, ctx) {
  const button = (value, avatar, name) =>
    `<button type="button" class="trader-btn" data-trader="${esc(value)}" aria-pressed="false">${avatar}<span class="trader-name">${esc(name)}</span><span class="meter" aria-hidden="true"><span></span></span></button>`;
  return [
    button(
      '',
      `<span class="avatar avatar-all" aria-hidden="true">${ALL_ICON}</span>`,
      'All'
    ),
    ...traders.map(t => button(t, avatarHtml(t, ctx), t))
  ].join('');
}

export function traderProgressLabel(trader, { done, total }) {
  return `${trader || 'All traders'}: ${count(done)} of ${count(total)} quests done`;
}

export function listHtml(groups, ctx) {
  return groups
    .map(group => {
      const collapsed = Boolean(ctx.collapsed[group.trader]) && !ctx.query;
      const totals = ctx.summary.traders.get(group.trader) || { done: 0, total: 0 };
      return `<section class="trader-group">
        <h3 class="group-head">
          <button type="button" class="group-toggle" data-action="collapse" data-trader="${esc(group.trader)}" aria-expanded="${!collapsed}">
            ${avatarHtml(group.trader, ctx)}
            <span class="group-name">${esc(group.trader)}</span>
            <span class="group-meta">${count(totals.done)} / ${count(totals.total)} done</span>
            <span class="group-shown">${count(group.tasks.length)} shown</span>
            <span class="chevron" aria-hidden="true"></span>
          </button>
        </h3>
        ${collapsed ? '' : `<ol class="quests">${group.tasks.map(t => rowHtml(t, ctx)).join('')}</ol>`}
      </section>`;
    })
    .join('');
}

export function emptyListHtml(tab, counts, hasFilters) {
  if (counts.all === 0) {
    return `<div class="empty"><p>No quests match these filters.</p>${
      hasFilters
        ? '<button type="button" class="btn" data-action="clear-filters">Clear filters</button>'
        : ''
    }</div>`;
  }
  const hints = {
    available: counts.locked
      ? 'Nothing is available right now — check <strong>Locked</strong> to see what unlocks next.'
      : 'Everything here is done. Nice work.',
    locked: 'Nothing is locked here — you can take every remaining quest.',
    completed: 'No completed quests here yet. Tick a quest off as you finish it.'
  };
  return `<div class="empty"><p>${hints[tab] || 'Nothing to show.'}</p></div>`;
}

export function skeletonHtml(rows = 8) {
  return `<div class="skeleton" aria-hidden="true">${'<div class="skeleton-row"></div>'.repeat(rows)}</div>`;
}

const STANDING_FMT = n => `${n > 0 ? '+' : ''}${Number(n.toFixed(2))}`;

function questLink(id, ctx, note = '') {
  const t = ctx.byId.get(id);
  if (!t) return '';
  const st = ctx.statuses.get(id)?.state || 'available';
  const meta = [t.trader, STATE_LABEL[st], note].filter(Boolean).join(' · ');
  return `<li class="link-row" data-state="${st}">
    <button type="button" class="text-btn" data-action="open" data-id="${esc(id)}">${esc(t.name)}</button>
    <span class="link-meta">${esc(meta)}</span>
  </li>`;
}

function requirementsHtml(task, st, ctx) {
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
      `<li class="link-row" data-state="${ok ? 'completed' : 'locked'}"><span>Level ${task.level}</span><span class="link-meta">${note}</span></li>`
    );
  }
  for (const req of task.requires) {
    const prereq = ctx.byId.get(req.id);
    if (!prereq) continue;
    if (ctx.faction && prereq.faction !== 'Any' && prereq.faction !== ctx.faction)
      continue;
    const note = req.status.includes('failed')
      ? 'unlocks if failed'
      : req.status.includes('active')
        ? 'accepting it is enough'
        : '';
    rows.push(questLink(req.id, ctx, note));
  }
  for (const r of task.traderReqs) {
    const what =
      r.type === 'level'
        ? `loyalty level ${r.value}`
        : `${r.type} ${r.compare} ${r.value}`;
    rows.push(`<li class="link-row"><span>${esc(r.trader)} ${esc(what)}</span></li>`);
  }
  return rows.length
    ? rows.join('')
    : '<li class="link-row"><span class="link-meta">None — available from the start.</span></li>';
}

export function detailHtml(task, ctx) {
  if (!task) {
    return `<div class="detail-empty">
      <p class="detail-kicker">Quest details</p>
      <p>Pick a quest to see its objectives, requirements and rewards.</p>
    </div>`;
  }
  const st = ctx.statuses.get(task.id) || {
    state: 'available',
    missing: [],
    needLevel: null
  };
  const done = st.state === 'completed';
  const required = requiredObjectives(task);
  const checkedCount = required.filter(o =>
    isObjectiveChecked(ctx.bucket, task, o)
  ).length;

  const objectives = task.objectives.length
    ? task.objectives
        .map(o => {
          const checked = isObjectiveChecked(ctx.bucket, task, o);
          return `<li class="objective${checked ? ' is-done' : ''}">
            <label>
              <input class="check" type="checkbox" data-action="objective" data-task="${esc(task.id)}" data-id="${esc(o.id)}"${checked ? ' checked' : ''}>
              <span class="objective-text">${esc(o.text)}${o.optional ? ' <span class="tag tag-quiet">Optional</span>' : ''}</span>
            </label>
            ${o.maps.length ? `<span class="objective-maps">${o.maps.map(esc).join(', ')}</span>` : ''}
          </li>`;
        })
        .join('')
    : '<li class="objective"><span class="objective-text">No objective details available.</span></li>';

  const unlocks = (ctx.unlocks.get(task.id) || [])
    .filter(id => {
      const t = ctx.byId.get(id);
      return t && (!ctx.faction || t.faction === 'Any' || t.faction === ctx.faction);
    })
    .map(id => questLink(id, ctx))
    .join('');

  const rewards = [];
  if (task.xp) rewards.push(`<li>${count(task.xp)} XP</li>`);
  for (const s of task.rewards.standing) {
    rewards.push(`<li>${esc(s.trader)} standing ${esc(STANDING_FMT(s.standing))}</li>`);
  }
  for (const item of task.rewards.items) {
    rewards.push(
      `<li>${item.count > 1 ? `${count(item.count)} × ` : ''}${esc(item.name)}</li>`
    );
  }

  const kicker = [task.trader, task.faction !== 'Any' ? `${task.faction} only` : null]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  const badges = [
    `<span class="state-badge" data-state="${st.state}">${STATE_LABEL[st.state]}</span>`
  ];
  if (task.kappa) badges.push('<span class="tag tag-kappa">Kappa</span>');
  if (task.lightkeeper) badges.push('<span class="tag tag-lk">Lightkeeper</span>');
  for (const m of task.maps) badges.push(`<span class="tag">${esc(m)}</span>`);

  const links = [];
  if (task.wikiLink) {
    links.push(
      `<a class="btn" href="${esc(task.wikiLink)}" target="_blank" rel="noopener noreferrer">Wiki ↗</a>`
    );
  }
  if (task.slug) {
    links.push(
      `<a class="btn" href="https://tarkov.dev/task/${esc(encodeURIComponent(task.slug))}" target="_blank" rel="noopener noreferrer">tarkov.dev ↗</a>`
    );
  }

  return `<div class="detail-head">
      <p class="detail-kicker">${kicker}</p>
      <h2 class="detail-title" id="detail-title" tabindex="-1">${esc(task.name)}</h2>
      <div class="detail-badges">${badges.join('')}</div>
      <button type="button" class="sheet-close" data-action="close-detail" aria-label="Close quest details">×</button>
    </div>
    <div class="detail-actions">
      <button type="button" class="btn ${done ? '' : 'btn-primary'}" data-action="toggle" data-id="${esc(task.id)}">${done ? 'Mark not complete' : 'Mark complete'}</button>
      ${links.join('')}
    </div>
    <section class="detail-section">
      <h3>Objectives${required.length ? ` <span class="section-count">${checkedCount}/${required.length}</span>` : ''}</h3>
      <ul class="objectives">${objectives}</ul>
    </section>
    <section class="detail-section">
      <h3>Requirements</h3>
      <ul class="link-list">${requirementsHtml(task, st, ctx)}</ul>
    </section>
    ${unlocks ? `<section class="detail-section"><h3>Unlocks</h3><ul class="link-list">${unlocks}</ul></section>` : ''}
    ${rewards.length ? `<section class="detail-section"><h3>Rewards</h3><ul class="rewards">${rewards.join('')}</ul></section>` : ''}`;
}
