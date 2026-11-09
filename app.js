'use strict';
/* Intemeratus Train — offline training planner/logger. All data stays on this device (localStorage). */
const KEY = 'intemeratus-train-v1';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPES = { run: { l: 'Run', u: 'mi' }, bike: { l: 'Bike', u: 'min' }, swim: { l: 'Swim', u: 'mi' }, row: { l: 'Row', u: 'km' }, lift: { l: 'Lift', u: '' } };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r1 = (n) => Math.round(n * 10) / 10;

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ---------- default plan ---------- */
let seq = 0;
const mk = (type, name, t, x) => Object.assign({ id: 'd' + (++seq), type, name, t: t || 0 }, x || {});
function defaultPlan() {
  seq = 0;
  const A = () => [
    mk('run', 'Run to gym', 1),
    mk('lift', 'Bench press', 0, { sets: 3, reps: '8–10' }),
    mk('lift', 'Seated cable row', 0, { sets: 3, reps: '8–10' }),
    mk('lift', 'Shoulder press', 0, { sets: 2, reps: '10' }),
    mk('lift', 'Bicep curls', 0, { sets: 2, reps: '10–12' }),
    mk('lift', 'Triceps pushdowns', 0, { sets: 2, reps: '10–12' }),
    mk('run', 'Run home', 1)];
  const B = () => [
    mk('run', 'Run to gym', 1),
    mk('lift', 'Pull-ups / lat pulldowns', 0, { sets: 3, reps: '8–10' }),
    mk('lift', 'Incline dumbbell press', 0, { sets: 3, reps: '8–10' }),
    mk('lift', 'Lateral raises', 0, { sets: 2, reps: '12–15' }),
    mk('lift', 'Hammer curls', 0, { sets: 2, reps: '10–12' }),
    mk('lift', 'Overhead triceps extensions', 0, { sets: 2, reps: '10–12' }),
    mk('run', 'Run home', 1)];
  const S = (slot, items) => ({ slot, items });
  return [
    [S('DM', A()), S('DP', [mk('run', 'Easy run', 8, { note: 'with strides' })]), S('DN', [mk('swim', 'Swim', 1, { note: '45 min' })])],
    [S('DM', B()), S('DP', [mk('run', 'Easy run', 8)]), S('DN', [mk('bike', 'Bike', 45)])],
    [S('DP', [mk('run', 'Workout run', 8)]), S('DS', [mk('row', 'Row', 5, { note: '25 min' })])],
    [S('DM', A()), S('DP', [mk('run', 'Easy run', 8)]), S('DN', [mk('run', 'Run to gym', 1), mk('swim', 'Swim', 1, { note: '45 min' }), mk('run', 'Run home', 1)])],
    [S('DM', B()), S('DP', [mk('run', 'Easy run', 8)])],
    [S('DM', [mk('run', 'Long run', 15)]), S('DS', [mk('row', 'Row', 5, { note: '25 min' })])],
    [S('DM', [mk('run', 'Easy run', 6)]), S('DS', [mk('run', 'Run to gym', 1), mk('bike', 'Bike', 90), mk('run', 'Run home', 1)])]
  ];
}
// conv: bike = minutes per 1 running-equivalent mile; swim/row = run miles per swim mile / row km
const defaults = () => ({ v: 1, plan: defaultPlan(), logs: {}, notes: {}, conv: { bike: 11.25, swim: 5, row: 0.5 } });

let S = load();
function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) { const o = JSON.parse(r); if (o && Array.isArray(o.plan)) return Object.assign(defaults(), o); }
  } catch (e) { /* fall through */ }
  return defaults();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save (storage blocked)'); } }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }

/* ---------- UI state ---------- */
let tab = 'day';
let wk = iso(monday(new Date()));
let dow = (new Date().getDay() + 6) % 7;
let pdow = dow; // day selected in Plan tab
const todayISO = () => iso(new Date());
const dateOf = (i) => parse(addDays(wk, i));
const wkLog = (w) => S.logs[w] || (S.logs[w] = {});

/* ---------- stats ---------- */
function eq(it, v) {
  const c = S.conv;
  switch (it.type) {
    case 'run': return v;
    case 'bike': return v / (c.bike || 11.25);
    case 'swim': return v * c.swim;
    case 'row': return v * c.row;
    default: return 0;
  }
}
const actual = (it, l) => (l && l.a !== undefined && l.a !== '' && !isNaN(+l.a) ? +l.a : (it.t || 0));
function stats(w, only) {
  const r = { plan: 0, done: 0, n: 0, nd: 0, by: { run: [0, 0], bike: [0, 0], swim: [0, 0], row: [0, 0] } };
  const L = S.logs[w] || {};
  S.plan.forEach((day, di) => {
    if (only != null && di !== only) return;
    day.forEach((s) => s.items.forEach((it) => {
      const l = L[it.id]; const p = it.t || 0;
      r.n++; r.plan += eq(it, p);
      if (r.by[it.type]) r.by[it.type][0] += p;
      if (l && l.d) {
        r.nd++; const a = actual(it, l); r.done += eq(it, a);
        if (r.by[it.type]) r.by[it.type][1] += a;
      }
    }));
  });
  return r;
}
function targetText(it) {
  let t = '';
  if (it.type === 'lift') t = (it.sets || 0) + ' × ' + (it.reps || '');
  else t = (it.t || 0) + ' ' + TYPES[it.type].u;
  if (it.note) t += ' · ' + it.note;
  return t;
}

/* ---------- views ---------- */
function weekBar() {
  const cur = wk === iso(monday(new Date()));
  const a = parse(wk), b = parse(addDays(wk, 6));
  return `<div class="wkbar"><button class="btn sq" data-act="wk" data-n="-1" aria-label="Previous week">‹</button>
  <div class="lbl">${fmt(a)} – ${fmt(b)}${cur ? '' : ' <button class="btn sm" data-act="wk" data-n="0">This week</button>'}</div>
  <button class="btn sq" data-act="wk" data-n="1" aria-label="Next week">›</button></div>`;
}
function progress() {
  const st = stats(wk); const pct = st.plan ? Math.min(100, st.done / st.plan * 100) : 0;
  return `<div class="prog"><div class="row"><span><b>${r1(st.done)}</b> / ${r1(st.plan)} mi equivalent</span><span class="mut">${st.nd}/${st.n} done</span></div>
  <div class="trk${pct >= 100 ? ' ok' : ''}"><div style="width:${pct}%"></div></div></div>`;
}
function dayPills(sel, act) {
  const t = todayISO();
  return '<div class="days">' + DAYS.map((n, i) => {
    const ds = stats(wk, i); const dn = ds.n > 0 && ds.nd === ds.n;
    return `<button class="d${i === sel ? ' sel' : ''}${addDays(wk, i) === t ? ' today' : ''}${act === 'day' && dn ? ' dn' : ''}" data-act="${act}" data-d="${i}"><i>${n[0]}${n.slice(1, 3).toLowerCase()}</i><b>${dateOf(i).getDate()}</b></button>`;
  }).join('') + '</div>';
}
function topHTML() { return weekBar() + progress() + dayPills(dow, 'day'); }

function itemHTML(it, L, prev) {
  const l = L[it.id] || {}; let body = '';
  if (it.type === 'lift') {
    const pl = prev[it.id] && prev[it.id].s;
    for (let i = 0; i < (it.sets || 0); i++) {
      const s = (l.s && l.s[i]) || {}; const p = (pl && pl[i]) || {};
      body += `<div class="set"><i>${i + 1}</i>
        <input type="text" inputmode="decimal" placeholder="${esc(p.w || 'lb')}" value="${esc(s.w || '')}" data-f="sw" data-id="${it.id}" data-i="${i}">
        <span>lb ×</span>
        <input type="text" inputmode="numeric" placeholder="${esc(p.r || 'reps')}" value="${esc(s.r || '')}" data-f="sr" data-id="${it.id}" data-i="${i}"></div>`;
    }
    if (pl && pl.some((s) => s && (s.w || s.r))) body += `<div class="hint">Last week: ${pl.filter((s) => s && (s.w || s.r)).map((s) => esc((s.w || '–') + '×' + (s.r || '–'))).join(' · ')}</div>`;
  } else {
    body = `<label class="act"><span>Actual</span><input type="text" inputmode="decimal" placeholder="${it.t}" value="${esc(l.a == null ? '' : l.a)}" data-f="a" data-id="${it.id}"><span>${TYPES[it.type].u}</span></label>`;
  }
  return `<div class="it${l.d ? ' done' : ''}"><button class="chk" data-act="tog" data-id="${it.id}" aria-label="Mark done">✓</button>
    <div class="mid"><div class="nm">${esc(it.name)}</div><div class="tg">${esc(targetText(it))}</div>${body}</div></div>`;
}
function dayHTML() {
  const day = S.plan[dow]; const L = wkLog(wk); const prev = S.logs[addDays(wk, -7)] || {};
  const ds = stats(wk, dow);
  let h = `<h2>${DAYS[dow]}<small>${fmt(dateOf(dow))}${ds.plan ? ' · ' + r1(ds.plan) + ' mi eq' : ''}</small></h2>`;
  if (!day.some((s) => s.items.length)) h += '<p class="mut">Rest day. Add sessions in the Plan tab.</p>';
  day.forEach((s) => {
    if (!s.items.length) return;
    h += `<section class="card"><div class="sh"><span class="pill">${esc(s.slot)}</span></div>${s.items.map((it) => itemHTML(it, L, prev)).join('')}</section>`;
  });
  h += `<h3>Notes</h3><textarea data-f="note" placeholder="Sleep, soreness, how it felt…">${esc(S.notes[wk + ':' + dow] || '')}</textarea>`;
  return h;
}
function renderDay() {
  $('#view').innerHTML = `<div id="top">${topHTML()}</div><div id="body">${dayHTML()}</div>`;
}
function updateTop() { const t = $('#top'); if (t) t.innerHTML = topHTML(); }

function renderWeek() {
  const st = stats(wk);
  const cell = (l, a, b, u) => `<div class="stat"><span>${l}</span><b>${r1(a)}</b> <small>/ ${r1(b)} ${u}</small></div>`;
  let h = weekBar() + '<div class="grid">' +
    cell('Running', st.by.run[1], st.by.run[0], 'mi') + cell('Equivalent', st.done, st.plan, 'mi') +
    cell('Bike', st.by.bike[1], st.by.bike[0], 'min') + cell('Swim', st.by.swim[1], st.by.swim[0], 'mi') +
    cell('Row', st.by.row[1], st.by.row[0], 'km') +
    `<div class="stat"><span>Items done</span><b>${st.nd}</b> <small>/ ${st.n}</small></div></div><h3>By day (mi equivalent)</h3>`;
  DAYS.forEach((n, i) => {
    const d = stats(wk, i); const pct = d.plan ? Math.min(100, d.done / d.plan * 100) : 0;
    h += `<div class="brow"><span class="l">${n.slice(0, 3)}</span><div class="trk${pct >= 100 ? ' ok' : ''}"><div style="width:${pct}%"></div></div><span class="v">${r1(d.done)} / ${r1(d.plan)}</span></div>`;
  });
  const weeks = Object.keys(S.logs).filter((w) => w !== wk && Object.values(S.logs[w]).some((x) => x && x.d)).sort().reverse().slice(0, 16);
  if (weeks.length) {
    h += '<h3>Past weeks</h3>';
    weeks.forEach((w) => { const s = stats(w); h += `<button class="hist" data-act="openweek" data-w="${w}"><span>${fmt(parse(w))}</span><span class="mut">${r1(s.by.run[1])} mi run · ${r1(s.done)} mi eq</span></button>`; });
  }
  $('#view').innerHTML = h;
}

function renderPlan() {
  const day = S.plan[pdow];
  let h = '<h2>Edit plan</h2><p class="mut">Changes apply to every week. Past logs are kept.</p>' + dayPills(pdow, 'pday').replace(/ dn/g, '');
  h += `<h3>${DAYS[pdow]}</h3>`;
  day.forEach((s, si) => {
    h += `<section class="card"><div class="sh"><input style="width:90px;font-weight:800" value="${esc(s.slot)}" data-f="p" data-p="slot" data-si="${si}" aria-label="Session label"><button class="btn sm red" data-act="delsess" data-si="${si}">Delete session</button></div>`;
    s.items.forEach((it, ii) => {
      const ref = `data-si="${si}" data-ii="${ii}"`;
      h += `<div class="pi"><input class="nmi" value="${esc(it.name)}" data-f="p" data-p="name" ${ref} aria-label="Name">
        <select data-f="p" data-p="type" ${ref}>${Object.keys(TYPES).map((k) => `<option value="${k}"${k === it.type ? ' selected' : ''}>${TYPES[k].l}</option>`).join('')}</select>`;
      if (it.type === 'lift') h += `<input class="n2" inputmode="numeric" value="${esc(it.sets)}" data-f="p" data-p="sets" ${ref} aria-label="Sets"><input class="rep" value="${esc(it.reps)}" data-f="p" data-p="reps" ${ref} aria-label="Reps">`;
      else h += `<input class="n2" inputmode="decimal" value="${esc(it.t)}" data-f="p" data-p="t" ${ref} aria-label="Target"><span class="mut" style="align-self:center">${TYPES[it.type].u}</span>`;
      h += `<input class="notei" placeholder="Note (optional)" value="${esc(it.note || '')}" data-f="p" data-p="note" ${ref}>
        <button class="btn sm red" data-act="delitem" ${ref}>Remove</button></div>`;
    });
    h += `<button class="btn sm" data-act="additem" data-si="${si}">+ Add item</button></section>`;
  });
  h += '<button class="btn" data-act="addsess">+ Add session</button>';
  $('#view').innerHTML = h;
}

function renderData() {
  const c = S.conv;
  $('#view').innerHTML = `<h2>Data &amp; settings</h2>
  <h3>Equivalency</h3>
  <div class="card">
    <div class="fld"><span>Bike minutes = 1 run mile</span><input inputmode="decimal" value="${c.bike}" data-f="conv" data-k="bike"></div>
    <div class="fld"><span>Run miles per swim mile</span><input inputmode="decimal" value="${c.swim}" data-f="conv" data-k="swim"></div>
    <div class="fld"><span>Run miles per row km</span><input inputmode="decimal" value="${c.row}" data-f="conv" data-k="row"></div>
  </div>
  <h3>Backup</h3>
  <p class="mut">Everything is stored on this phone only. Export a backup to Files or iCloud regularly, especially before iOS updates or clearing Safari data.</p>
  <div class="rowb"><button class="btn gold" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>
  <h3>Reset</h3>
  <div class="rowb"><button class="btn red" data-act="resetlogs">Clear all logs</button><button class="btn red" data-act="resetplan">Restore default plan</button></div>
  <h3>Install</h3>
  <p class="mut">In Safari: Share → Add to Home Screen. Open it from the home-screen icon and enter data there. The Safari tab and the installed app keep separate storage.</p>
  <p class="mut" id="persist"></p>`;
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((p) => { const e = $('#persist'); if (e) e.textContent = p ? 'Storage: protected from automatic clearing.' : 'Storage: not marked persistent. Keep backups.'; });
}

function render() {
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  ({ day: renderDay, week: renderWeek, plan: renderPlan, data: renderData })[tab]();
}

/* ---------- events ---------- */
function findItem(id) { for (const d of S.plan) for (const s of d) for (const it of s.items) if (it.id === id) return it; return null; }
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act; const D = b.dataset;
  if (a === 'tab') { tab = D.t; render(); $('#view').scrollTop = 0; }
  else if (a === 'wk') { wk = D.n === '0' ? iso(monday(new Date())) : addDays(wk, 7 * +D.n); render(); }
  else if (a === 'day') { dow = +D.d; render(); }
  else if (a === 'pday') { pdow = +D.d; render(); }
  else if (a === 'openweek') { wk = D.w; dow = 0; tab = 'day'; render(); }
  else if (a === 'tog') {
    const l = (wkLog(wk)[D.id] = wkLog(wk)[D.id] || {}); l.d = !l.d; save();
    const it = b.closest('.it'); it.classList.toggle('done', !!l.d); updateTop();
  }
  else if (a === 'addsess') { S.plan[pdow].push({ slot: 'New', items: [{ id: newId(), type: 'run', name: 'New item', t: 1 }] }); save(); render(); }
  else if (a === 'delsess') { if (confirm('Delete this session?')) { S.plan[pdow].splice(+D.si, 1); save(); render(); } }
  else if (a === 'additem') { S.plan[pdow][+D.si].items.push({ id: newId(), type: 'run', name: 'New item', t: 1 }); save(); render(); }
  else if (a === 'delitem') { S.plan[pdow][+D.si].items.splice(+D.ii, 1); save(); render(); }
  else if (a === 'export') exportData();
  else if (a === 'import') $('#imp').click();
  else if (a === 'resetlogs') { if (confirm('Delete ALL logged workouts and notes? This cannot be undone.')) { S.logs = {}; S.notes = {}; save(); toast('Logs cleared'); } }
  else if (a === 'resetplan') { if (confirm('Replace your plan with the default plan? Logs are kept.')) { S.plan = defaultPlan(); save(); toast('Plan restored'); } }
});

document.addEventListener('input', (e) => {
  const t = e.target; const f = t.dataset.f; if (!f) return;
  if (f === 'a') { const l = (wkLog(wk)[t.dataset.id] = wkLog(wk)[t.dataset.id] || {}); l.a = t.value.replace(',', '.'); save(); updateTop(); }
  else if (f === 'sw' || f === 'sr') {
    const l = (wkLog(wk)[t.dataset.id] = wkLog(wk)[t.dataset.id] || {}); l.s = l.s || [];
    const i = +t.dataset.i; l.s[i] = l.s[i] || {}; l.s[i][f === 'sw' ? 'w' : 'r'] = t.value; save();
  }
  else if (f === 'note') { S.notes[wk + ':' + dow] = t.value; save(); }
  else if (f === 'conv') { const v = parseFloat(t.value.replace(',', '.')); if (v > 0) { S.conv[t.dataset.k] = v; save(); } }
  else if (f === 'p') {
    const d = t.dataset; const s = S.plan[pdow][+d.si]; if (!s) return;
    if (d.p === 'slot') { s.slot = t.value; save(); return; }
    const it = s.items[+d.ii]; if (!it) return;
    if (d.p === 't' || d.p === 'sets') { const v = parseFloat(t.value.replace(',', '.')); it[d.p] = isNaN(v) ? 0 : v; }
    else if (d.p === 'type') { it.type = t.value; if (it.type === 'lift') { it.sets = it.sets || 3; it.reps = it.reps || '8–10'; } save(); render(); return; }
    else it[d.p] = t.value;
    save();
  }
});

async function exportData() {
  const name = 'train-backup-' + todayISO() + '.json';
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Training backup' }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#imp').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o || !Array.isArray(o.plan) || typeof o.logs !== 'object') throw new Error('bad');
      if (!confirm('Replace everything on this device with this backup?')) return;
      S = Object.assign(defaults(), o); save(); render(); toast('Backup imported');
    } catch (err) { toast('That file is not a valid backup'); }
  };
  rd.readAsText(f); e.target.value = '';
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && tab === 'day' && document.activeElement && document.activeElement.tagName !== 'INPUT') { /* keep selection */ } });

/* ---------- boot ---------- */
save();
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
