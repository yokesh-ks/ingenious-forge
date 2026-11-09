/* @ds-bundle: {"format":4,"namespace":"Clan","components":[{"name":"Logo"},{"name":"TradeSidebar"},{"name":"ProjectTree"},{"name":"SessionHeader"},{"name":"SandboxNotice"},{"name":"ChatMessage"},{"name":"ReplyFooter"},{"name":"TurnStatus"},{"name":"ProcessGroup"},{"name":"FileExcerpt"},{"name":"ToolApproval"},{"name":"AgentQuestion"},{"name":"TaskList"},{"name":"Composer"},{"name":"ApprovalModePicker"},{"name":"ModelPicker"},{"name":"BranchStatus"},{"name":"SessionMetrics"},{"name":"PanelTabs"},{"name":"PanelStart"},{"name":"FileTree"},{"name":"ChangedFiles"},{"name":"DiffView"},{"name":"TerminalView"},{"name":"Button"},{"name":"Field"},{"name":"Tabs"},{"name":"StatusTag"},{"name":"ActorMark"},{"name":"Hallmark"},{"name":"EvidenceBlock"},{"name":"AuditTrail"},{"name":"ApprovalGate"},{"name":"AuthorityMeter"},{"name":"KillSwitch"},{"name":"FigureTile"},{"name":"LedgerTable"},{"name":"DaemonStatus"},{"name":"TradeRail"}]} */
(function () {
  var R = window.React, h = R.createElement, useState = R.useState, useId = R.useId;

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  var GLYPHS = {
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    clock: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M12 6v6l4 2'],
    loader: ['M21 12a9 9 0 1 1-6.219-8.56'],
    user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0'],
    ban: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'm4.9 4.9 14.2 14.2'],
    octagon: ['M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z', 'M12 8v4', 'M12 16h.01'],
    dash: ['M5 12h14'],
    lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4']
  };

  function Glyph(p) {
    return h('svg', { className: p.className, width: p.size || 14, height: p.size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      GLYPHS[p.name].map(function (d, i) { return h('path', { key: i, d: d }); }));
  }

  var STATES = {
    queued: { word: 'Queued', icon: 'clock', tone: 'idle' },
    running: { word: 'Running', icon: 'loader', tone: 'idle' },
    proved: { word: 'Proved', icon: 'check', tone: 'proof' },
    held: { word: 'Held for you', icon: 'user', tone: 'gate' },
    failed: { word: 'Failed', icon: 'x', tone: 'halt' },
    refused: { word: 'Refused', icon: 'ban', tone: 'halt' },
    halted: { word: 'Halted', icon: 'octagon', tone: 'halt' },
    unproved: { word: 'Unproved', icon: 'dash', tone: 'idle' }
  };

  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md', rest = Object.assign({}, p);
    delete rest.variant; delete rest.size; delete rest.icon; delete rest.children; delete rest.className;
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('ic ic-btn', 'ic-btn-' + variant, 'ic-btn-' + size, p.className) }),
      p.icon ? h(Glyph, { name: p.icon, size: 16 }) : null, p.children);
  }

  function Field(p) {
    var auto = useId(), id = p.id || auto, rest = Object.assign({}, p);
    ['label', 'hint', 'error', 'mono', 'className'].forEach(function (k) { delete rest[k]; });
    var note = p.error || p.hint;
    return h('div', { className: cx('ic ic-field', p.error && 'ic-field-bad', p.className) },
      h('label', { htmlFor: id }, p.label),
      h('input', Object.assign({}, rest, { id: id, className: cx('ic-input', p.mono && 'ic-mono'), 'aria-invalid': p.error ? true : undefined, 'aria-describedby': note ? id + '-note' : undefined })),
      note ? h('div', { id: id + '-note', className: 'ic-field-note' }, p.error ? h(Glyph, { name: 'x', size: 12 }) : null, note) : null);
  }

  function Tabs(p) {
    var st = useState(p.defaultValue || p.items[0].value), cur = p.value !== undefined ? p.value : st[0];
    function pick(v) { st[1](v); if (p.onChange) p.onChange(v); }
    function key(e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var i = p.items.findIndex(function (t) { return t.value === cur; });
      var next = p.items[(i + d + p.items.length) % p.items.length];
      pick(next.value);
      var sib = d > 0 ? e.currentTarget.nextSibling || e.currentTarget.parentNode.firstChild : e.currentTarget.previousSibling || e.currentTarget.parentNode.lastChild;
      sib.focus();
    }
    return h('div', { className: 'ic ic-tabs', role: 'tablist' }, p.items.map(function (t) {
      var on = t.value === cur;
      return h('button', { key: t.value, type: 'button', role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, className: cx('ic-tab', on && 'on'), onClick: function () { pick(t.value); }, onKeyDown: key },
        t.label, t.count !== undefined ? h('span', { className: 'ic-tab-count' }, t.count) : null);
    }));
  }

  function StatusTag(p) {
    var s = STATES[p.state || 'queued'];
    return h('span', { className: cx('ic ic-tag', 'ic-t-' + s.tone) },
      h(Glyph, { name: s.icon, size: 12, className: p.state === 'running' ? 'ic-spin' : undefined }), p.children || s.word);
  }

  function ActorMark(p) {
    var kind = p.kind || 'agent', name = p.name || '';
    var code = p.code || (kind === 'agent' ? name.slice(0, 3) : name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2));
    var mark = h('span', { className: cx('ic-punch', 'ic-punch-' + kind), title: (kind === 'agent' ? 'Agent: ' : 'Person: ') + name, 'aria-hidden': p.showName ? true : undefined, 'aria-label': p.showName ? undefined : name, role: p.showName ? undefined : 'img' }, code.toUpperCase());
    if (!p.showName) return h('span', { className: 'ic ic-actor' }, mark);
    return h('span', { className: 'ic ic-actor' }, mark, h('span', { className: 'ic-actor-text' }, h('b', null, name), p.role ? h('small', null, p.role) : null));
  }

  function Hallmark(p) {
    var s = STATES[p.state || 'proved'];
    var inner = [
      h('span', { key: 'm', className: 'ic-hm-maker' }, (p.maker || '').toUpperCase()),
      h('span', { key: 'a', className: 'ic-hm-assay' }, h(Glyph, { name: s.icon, size: 12 }), s.word === 'Held for you' ? 'Held' : s.word),
      h('span', { key: 'd', className: 'ic-hm-date' }, p.date)
    ];
    var cls = cx('ic ic-hm', 'ic-t-' + s.tone, p.state === 'unproved' && 'ic-hm-open');
    return p.href ? h('a', { className: cls, href: p.href }, inner) : h('span', { className: cls }, inner);
  }

  function EvidenceBlock(p) {
    var bad = p.exit !== undefined && p.exit !== 0;
    return h('figure', { className: 'ic ic-ev' },
      h('figcaption', null, h('code', null, '$ ' + p.command), h('span', { className: cx('ic-ev-exit', bad ? 'ic-c-halt' : 'ic-c-proof') }, 'exit ' + p.exit)),
      h('pre', null, p.output),
      p.footer ? h('div', { className: 'ic-ev-foot' }, p.footer) : null);
  }

  function AuditTrail(p) {
    var broken = p.intact === false;
    return h('section', { className: 'ic ic-audit' },
      h('header', null, h('span', { className: 'ic-audit-title' }, p.title || 'Audit trail'),
        h('span', { className: cx('ic-audit-chain', broken ? 'ic-c-halt' : 'ic-c-proof') }, h(Glyph, { name: broken ? 'x' : 'check', size: 12 }), broken ? 'Chain broken' : 'Chain intact')),
      h('ol', null, p.items.map(function (it, i) {
        return h('li', { key: i },
          h('span', { className: 'ic-audit-node' }),
          h('time', null, it.time),
          h(ActorMark, it.actor),
          h('span', { className: 'ic-audit-line' }, h('b', null, it.actor.name + ' ' + it.verb), ' ' + it.object),
          it.state ? h(StatusTag, { state: it.state }) : h('span', null),
          h('code', { className: 'ic-audit-hash' }, it.hash));
      })));
  }

  function ApprovalGate(p) {
    return h('section', { className: 'ic ic-gate', 'aria-label': 'Held for you' },
      h('header', null, h('span', { className: 'ic-gate-sign' }, 'Held for you'), p.mode ? h('span', { className: 'ic-gate-mode' }, p.mode) : null),
      h('div', { className: 'ic-gate-body' },
        h(ActorMark, Object.assign({ showName: true }, p.actor)),
        h('h3', null, p.title),
        p.amount ? h('div', { className: 'ic-gate-amount' }, p.amount) : null,
        p.reason ? h('p', null, p.reason) : null,
        p.policy ? h('div', { className: 'ic-gate-policy' }, 'Policy ', h('code', null, p.policy)) : null,
        p.checks ? h('ul', { className: 'ic-gate-checks' }, p.checks.map(function (c, i) {
          return h('li', { key: i }, h(StatusTag, { state: c.state }), h('span', null, c.label));
        })) : null),
      h('footer', null,
        h(Button, { variant: 'secondary', size: 'lg', onClick: p.onRefuse }, p.refuseLabel || 'Refuse'),
        h(Button, { variant: 'primary', size: 'lg', icon: p.stepUp ? 'lock' : undefined, onClick: p.onApprove }, p.approveLabel || (p.stepUp ? 'Approve with passkey' : 'Approve'))));
  }

  function AuthorityMeter(p) {
    var pct = Math.min(100, Math.round(p.used / p.limit * 100));
    var tone = pct >= 100 ? 'halt' : pct >= (p.warnAt || 80) ? 'gate' : 'idle';
    var fmt = p.format || function (n) { return String(n); };
    return h('div', { className: cx('ic ic-meter', 'ic-t-' + tone) },
      h('div', { className: 'ic-meter-head' }, h('span', null, p.label), h('code', null, fmt(p.used) + ' / ' + fmt(p.limit))),
      h('div', { className: 'ic-meter-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': p.limit, 'aria-valuenow': p.used, 'aria-label': p.label }, h('span', { style: { width: pct + '%' } })),
      tone !== 'idle' ? h('div', { className: 'ic-meter-note' }, tone === 'halt' ? 'Limit reached. New actions are refused.' : 'Near the limit. Larger actions will be held for you.') : null);
  }

  function KillSwitch(p) {
    var st = useState(!!p.defaultHalted), halted = p.halted !== undefined ? p.halted : st[0];
    function set(v, cb) { st[1](v); if (cb) cb(); }
    if (halted) return h('section', { className: 'ic ic-kill on', role: 'alert' },
      h('div', { className: 'ic-kill-text' }, h('div', { className: 'ic-kill-sign' }, (p.scope || 'Trading') + ' is halted'), h('p', null, p.detail || 'Open orders cancelled. Nothing runs until you resume.')),
      h(Button, { variant: 'secondary', size: 'lg', icon: 'lock', onClick: function () { set(false, p.onResume); } }, 'Resume with passkey'));
    return h('section', { className: 'ic ic-kill' },
      h('div', { className: 'ic-kill-text' }, h('div', { className: 'ic-kill-title' }, 'Kill switch'), h('p', null, 'Stops every agent in ' + (p.scope || 'Trading') + ' at once. No confirmation.')),
      h('button', { type: 'button', className: 'ic-kill-btn', onClick: function () { set(true, p.onHalt); } }, h(Glyph, { name: 'octagon', size: 20 }), 'Halt ' + (p.scope || 'Trading').toLowerCase()));
  }

  function FigureTile(p) {
    return h('div', { className: 'ic ic-tile' },
      h('div', { className: 'ic-tile-label' }, p.label),
      h('div', { className: 'ic-tile-fig' }, p.value),
      p.delta ? h('div', { className: cx('ic-tile-delta', p.direction === 'down' ? 'ic-c-down' : 'ic-c-up') }, h('span', { 'aria-hidden': true }, p.direction === 'down' ? '▼' : '▲'), ' ', p.delta) : null,
      h('div', { className: 'ic-tile-basis' }, p.basis ? h(StatusTag, { state: 'proved' }, p.basis) : h(StatusTag, { state: 'unproved' })));
  }

  function LedgerTable(p) {
    return h('div', { className: 'ic ic-ledger-wrap' }, h('table', { className: 'ic-ledger' },
      p.caption ? h('caption', null, p.caption) : null,
      h('thead', null, h('tr', null, p.columns.map(function (c) { return h('th', { key: c.key, scope: 'col', className: c.numeric ? 'num' : undefined }, c.label); }))),
      h('tbody', null, p.rows.map(function (r, i) {
        return h('tr', { key: i, className: r.state === 'failed' ? 'ic-break' : undefined }, p.columns.map(function (c) {
          var v = r[c.key];
          return h('td', { key: c.key, className: c.numeric ? 'num' : c.mono ? 'mono' : undefined }, c.key === 'state' ? h(StatusTag, { state: v }) : v);
        }));
      })),
      p.total ? h('tfoot', null, h('tr', null, p.columns.map(function (c) { return h('td', { key: c.key, className: c.numeric ? 'num' : undefined }, p.total[c.key]); }))) : null));
  }

  function DaemonStatus(p) {
    var state = p.state || 'connected';
    var words = { connected: 'Daemon connected', degraded: 'Daemon degraded', offline: 'Daemon offline' };
    return h('div', { className: cx('ic ic-daemon', 'ic-daemon-' + state), role: 'status' },
      h('span', { className: 'ic-daemon-dot' }),
      h('b', null, words[state]),
      p.address ? h('code', null, p.address) : null,
      p.surface ? h('span', null, p.surface) : null);
  }

  var TRADES = [{ id: 'forge', code: 'Fg', name: 'Work' }];

  var TRADE_GLYPH = { forge: 'briefcase', finance: 'landmark', trading: 'candles', wiki: 'book', slides: 'board', schedules: 'calendar', plugins: 'plug', sites: 'globe', artifacts: 'layers', settings: 'gear' };
  var RAIL_TOOLS = [{ id: 'settings', name: 'Settings' }];

  function TradeRail(p) {
    var items = p.trades || TRADES, tools = p.tools || RAIL_TOOLS, st = useState(p.defaultValue || items[0].id), cur = p.value !== undefined ? p.value : st[0];
    function item(t) {
      var on = t.id === cur, glyph = t.icon || TRADE_GLYPH[t.id];
      return h('li', { key: t.id }, h('button', { type: 'button', className: on ? 'on' : undefined, 'aria-current': on ? 'page' : undefined, onClick: function () { st[1](t.id); if (p.onChange) p.onChange(t.id); } },
        h('span', { className: cx('ic-rail-punch', glyph && 'ic-rail-icon') }, glyph ? h(Glyph, { name: glyph, size: 20 }) : t.code), h('span', { className: 'ic-rail-name' }, t.name),
        t.held ? h('span', { className: 'ic-rail-held', title: t.held + ' held for you' }, t.held) : null));
    }
    return h('nav', { className: 'ic ic-rail', 'aria-label': 'Main' },
      h('div', { className: 'ic-rail-home' }, h(Logo, { size: 28, tone: 'reversed' })),
      h('ul', null, items.map(item)),
      h('ul', { className: 'ic-rail-tools' }, tools.map(item)));
  }

  window.Clan = Object.assign(window.Clan || {}, {
    Button: Button, Field: Field, Tabs: Tabs, StatusTag: StatusTag, ActorMark: ActorMark, Hallmark: Hallmark, EvidenceBlock: EvidenceBlock,
    AuditTrail: AuditTrail, ApprovalGate: ApprovalGate, AuthorityMeter: AuthorityMeter, KillSwitch: KillSwitch, FigureTile: FigureTile,
    LedgerTable: LedgerTable, DaemonStatus: DaemonStatus, TradeRail: TradeRail
  });
  /* ---- Forge ---- */
  Object.assign(GLYPHS, {
    plus: ['M5 12h14', 'M12 5v14'],
    chevR: ['m9 18 6-6-6-6'],
    chevD: ['m6 9 6 6 6-6'],
    up: ['m5 12 7-7 7 7', 'M12 19V5'],
    stop: ['M6 6h12v12H6z'],
    branch: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9'],
    folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'],
    pin: ['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'],
    terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
    shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    panelL: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 3v18'],
    panel: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M15 3v18'],
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
    search: ['M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'm21 21-4.3-4.3'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    copy: ['M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
    moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
    pen: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
    globe: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z'],
    message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    good: ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'],
    bad: ['M17 14V2', 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z'],
    share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'm16 6-4-4-4 4', 'M12 2v13'],
    plug: ['M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'],
    layers: ['M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z', 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12', 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'],
    gear: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
    briefcase: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', 'M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
    landmark: ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2l8 5H4z'],
    candles: ['M9 5v4', 'M8 9h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z', 'M9 15v2', 'M17 3v2', 'M16 5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M17 13v3', 'M3 3v16a2 2 0 0 0 2 2h16'],
    book: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    board: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'm7 21 5-5 5 5'],
    calendar: ['M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5', 'M16 2v4', 'M8 2v4', 'M3 10h5', 'M17.5 17.5 16 16.3V14', 'M16 16m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0']
  });

  function IconBtn(p) {
    return h('button', { type: 'button', className: cx('ic-ib', p.className), 'aria-label': p.label, title: p.label, 'aria-pressed': p.pressed, onClick: p.onClick }, h(Glyph, { name: p.icon, size: p.size || 16 }));
  }

  function Pick(p) {
    return h('label', { className: 'ic-pick', title: p.title },
      p.icon ? h(Glyph, { name: p.icon, size: 14 }) : null,
      h('span', { className: 'ic-sr' }, p.label),
      h('select', { value: p.value, onChange: function (e) { p.onChange(e.target.value); } }, p.options.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })),
      h(Glyph, { name: 'chevD', size: 12 }));
  }

  var LOGO_TILES = [[6, 6], [36, 6], [66, 6], [6, 36], [6, 66], [36, 66], [66, 66]];

  function Logo(p) {
    var size = p.size || 32, lockup = p.variant === 'lockup';
    var mark = h('svg', { className: 'ic-logo-mark', viewBox: '6 6 84 84', width: size, height: size, role: lockup ? undefined : 'img', 'aria-label': lockup ? undefined : 'Ingenious Clan', 'aria-hidden': lockup ? true : undefined },
      LOGO_TILES.map(function (t, i) { return h('rect', { key: i, x: t[0], y: t[1], width: 24, height: 24, rx: 3, fill: 'currentColor' }); }),
      h('circle', { cx: 48, cy: 48, r: 13, fill: 'var(--gate)' }));
    return h('span', { className: cx('ic ic-logo', p.tone === 'reversed' && 'ic-logo-rev'), style: { gap: Math.round(size * 0.26) } }, mark,
      lockup ? h('span', { className: 'ic-logo-word', style: { fontSize: Math.round(size * 1.24) } }, 'Ingenious Clan') : null);
  }

  function TradeSidebar(p) {
    return h('aside', { className: 'ic ic-side', 'aria-label': p.title },
      h('div', { className: 'ic-side-head' }, h('h2', null, p.title), p.onCollapse ? h(IconBtn, { icon: 'panelL', label: 'Collapse sidebar', onClick: p.onCollapse }) : null),
      p.newLabel ? h('div', { className: 'ic-side-new' }, h(Button, { icon: 'plus', onClick: p.onNew }, p.newLabel)) : null,
      h('div', { className: 'ic-side-body' }, p.children),
      p.daemon || p.onToggleTheme ? h('div', { className: 'ic-side-foot' }, p.daemon ? h(DaemonStatus, p.daemon) : h('span', null), p.onToggleTheme ? h(IconBtn, { icon: 'moon', label: 'Toggle theme', onClick: p.onToggleTheme }) : null) : null);
  }

  function SessionGlyph(p) {
    if (p.status === 'running') return h('span', { className: 'ic-sg', title: 'Running' }, h(Glyph, { name: 'loader', size: 14, className: 'ic-spin' }));
    if (p.status === 'held') return h('span', { className: 'ic-sg ic-c-gate', title: 'Held for you' }, h(Glyph, { name: 'user', size: 14 }));
    if (p.status === 'failed') return h('span', { className: 'ic-sg ic-c-halt', title: 'Failed' }, h(Glyph, { name: 'x', size: 14 }));
    return h('span', { className: 'ic-sg', 'aria-hidden': true });
  }

  function ProjectTree(p) {
    var st = useState(p.defaultOpen || p.projects.map(function (x) { return x.id; })), open = st[0];
    var sel = useState(p.defaultSession), cur = p.session !== undefined ? p.session : sel[0];
    function toggle(id) { st[1](open.indexOf(id) >= 0 ? open.filter(function (x) { return x !== id; }) : open.concat(id)); }
    return h('aside', { className: 'ic ic-ptree', 'aria-label': 'Projects' },
      h('div', { className: 'ic-ptree-head' }, h('span', null, 'Projects'), h(IconBtn, { icon: 'folder', label: 'Open a project folder', onClick: p.onOpenFolder })),
      h('ul', { className: 'ic-ptree-list' }, p.projects.map(function (pr) {
        var isOpen = open.indexOf(pr.id) >= 0;
        return h('li', { key: pr.id },
          h('div', { className: 'ic-ptree-project' },
            h('button', { type: 'button', 'aria-expanded': isOpen, onClick: function () { toggle(pr.id); } }, h(Glyph, { name: isOpen ? 'chevD' : 'chevR', size: 14 }), h('b', null, pr.name)),
            h(IconBtn, { icon: 'plus', label: 'New session in ' + pr.name, onClick: function () { if (p.onNew) p.onNew(pr.id); } })),
          isOpen ? h('ul', null, pr.sessions.map(function (s) {
            var on = s.id === cur;
            return h('li', { key: s.id }, h('button', { type: 'button', className: cx('ic-ptree-session', on && 'on'), 'aria-current': on ? 'true' : undefined, onClick: function () { sel[1](s.id); if (p.onSelect) p.onSelect(s.id); } },
              h(SessionGlyph, { status: s.status }), h('span', { className: 'ic-ptree-title' }, s.title),
              s.pinned ? h(Glyph, { name: 'pin', size: 12 }) : s.time ? h('time', null, s.time) : null));
          })) : null);
      })));
  }

  function SessionHeader(p) {
    return h('div', { className: 'ic ic-shead' },
      p.onOpenSidebar ? h(IconBtn, { icon: 'panelL', label: 'Open sidebar', onClick: p.onOpenSidebar }) : null,
      h('div', { className: 'ic-shead-title' }, h('h2', null, p.title), p.state ? h(StatusTag, { state: p.state }) : null),
      p.views ? h(Tabs, { items: p.views, defaultValue: p.defaultView, onChange: p.onView }) : null,
      h(IconBtn, { icon: 'panel', label: p.panelOpen ? 'Close workspace panel' : 'Open workspace panel', pressed: !!p.panelOpen, onClick: p.onTogglePanel }));
  }

  function SandboxNotice(p) {
    return h('div', { className: 'ic ic-sandbox', role: 'status' }, h(Glyph, { name: 'shield', size: 14 }), p.problem ? 'Sandbox unavailable: ' + p.problem : 'Commands are not sandboxed');
  }

  function ChatMessage(p) {
    var human = p.actor.kind === 'human';
    return h('article', { className: cx('ic ic-msg', human ? 'ic-msg-human' : 'ic-msg-agent') },
      h(ActorMark, p.actor),
      h('div', { className: 'ic-msg-body' }, p.children, p.footer || null));
  }

  function ReplyFooter(p) {
    return h('div', { className: 'ic ic-rfoot' },
      h(IconBtn, { icon: 'copy', label: 'Copy reply', size: 14 }), h(IconBtn, { icon: 'good', label: 'Good reply', size: 14 }), h(IconBtn, { icon: 'bad', label: 'Poor reply', size: 14 }), h(IconBtn, { icon: 'share', label: 'Share reply', size: 14 }),
      p.tokens ? h('code', null, p.tokens) : null,
      p.hallmark ? h(Hallmark, p.hallmark) : null);
  }

  var TURN_WORD = { running: 'Working', completed: 'Completed in', failed: 'Failed', stopped: 'Stopped' };

  function TurnStatus(p) {
    var state = p.state || 'running', st = useState(p.defaultOpen !== undefined ? p.defaultOpen : state !== 'completed'), open = st[0];
    return h('section', { className: cx('ic ic-turn', 'ic-turn-' + state) },
      h('button', { type: 'button', className: 'ic-turn-row', 'aria-expanded': open, onClick: function () { st[1](!open); } },
        h(Glyph, { name: open ? 'chevD' : 'chevR', size: 14 }),
        state === 'running' ? h(Glyph, { name: 'loader', size: 14, className: 'ic-spin' }) : null,
        h('span', null, TURN_WORD[state], p.elapsed ? h('code', null, ' ' + p.elapsed) : null),
        p.error ? h('code', { className: 'ic-turn-err' }, p.error) : null),
      open && p.children ? h('div', { className: 'ic-turn-body' }, p.children) : null);
  }

  var TOOL_GLYPH = { bash: 'terminal', read: 'file', write: 'pen', edit: 'pen', glob: 'search', grep: 'search', web_fetch: 'globe', todo_write: 'list', reasoning: 'message' };

  function ToolItem(p) {
    var st = useState(false), open = st[0], it = p.item;
    return h('li', null,
      h('div', { className: 'ic-tool-row' },
        h('button', { type: 'button', 'aria-expanded': it.body ? open : undefined, disabled: !it.body, onClick: function () { st[1](!open); } },
          h(Glyph, { name: TOOL_GLYPH[it.tool] || 'dash', size: 14 }), h('code', null, it.tool), h('span', { className: 'ic-tool-detail' }, it.detail)),
        h('button', { type: 'button', className: 'ic-tool-inspect', onClick: p.onInspect }, 'Inspect')),
      open && it.body ? h('div', { className: 'ic-tool-body' }, it.body) : null);
  }

  function ProcessGroup(p) {
    var st = useState(!!p.defaultOpen), open = st[0];
    return h('section', { className: 'ic ic-group' },
      h('button', { type: 'button', className: 'ic-group-head', 'aria-expanded': open, onClick: function () { st[1](!open); } }, h(Glyph, { name: open ? 'chevD' : 'chevR', size: 14 }), p.title, h('code', null, p.items.length)),
      open ? h('ul', null, p.items.map(function (it, i) { return h(ToolItem, { key: i, item: it, onInspect: p.onInspect }); })) : null);
  }

  function FileExcerpt(p) {
    return h('figure', { className: 'ic ic-excerpt' },
      h('figcaption', null, h('code', null, p.path), p.total ? h('span', null, p.total + ' lines') : null),
      h('pre', null, p.lines.map(function (l, i) {
        return l.gap ? h('div', { key: i, className: 'ic-excerpt-gap' }, l.gap + ' lines hidden') : h('div', { key: i }, h('span', { className: 'ic-ln' }, l.n), l.s);
      })));
  }

  function ToolApproval(p) {
    var st = useState(p.defaultAnswer || null), ans = st[0], kind = p.kind || 'command';
    function answer(v) { st[1](v); if (p.onAnswer) p.onAnswer(v); }
    if (ans) {
      return h('div', { className: 'ic ic-tapp-done' }, ans === 'deny' ? h(StatusTag, { state: 'refused' }, 'Denied') : h(Glyph, { name: 'check', size: 14 }),
        h('span', null, { approve: 'Approved once by you', deny: 'Denied by you', always_allow: 'Always allowed by you' }[ans]),
        p.command ? h('code', null, p.command) : p.path ? h('code', null, p.path) : null);
    }
    return h('section', { className: 'ic ic-tapp', 'aria-label': 'Held for you' },
      h('header', null, h('span', null, kind === 'command' ? 'Run this command?' : 'Apply this edit?'), h('span', { className: 'ic-tapp-held' }, h(Glyph, { name: 'user', size: 12 }), 'Held for you')),
      h('div', { className: 'ic-tapp-body' },
        p.reason ? h('p', null, p.reason) : null,
        p.command ? h('pre', null, '$ ' + p.command) : null,
        p.path ? h('code', { className: 'ic-tapp-path' }, p.path) : null,
        p.diff || null),
      h('footer', null,
        h(Button, { variant: 'primary', size: 'sm', onClick: function () { answer('approve'); } }, 'Approve'),
        h(Button, { size: 'sm', onClick: function () { answer('deny'); } }, 'Deny'),
        h(Button, { variant: 'ghost', size: 'sm', onClick: function () { answer('always_allow'); } }, kind === 'command' ? 'Always allow this command' : 'Always allow')));
  }

  function AgentQuestion(p) {
    var st = useState(p.defaultAnswer || null), ans = st[0];
    return h('section', { className: 'ic ic-ask', 'aria-label': 'Question from the agent' },
      h('header', null, h('span', null, p.question), ans ? null : h('span', { className: 'ic-tapp-held' }, h(Glyph, { name: 'user', size: 12 }), 'Held for you')),
      h('ul', null, p.options.map(function (o) {
        var on = ans === o.label;
        return h('li', { key: o.label }, h('button', { type: 'button', 'aria-pressed': on, className: on ? 'on' : undefined, disabled: !!ans && !on, onClick: function () { st[1](o.label); if (p.onAnswer) p.onAnswer(o.label); } }, h('b', null, o.label), o.hint ? h('span', null, o.hint) : null));
      })));
  }

  function TaskList(p) {
    var done = p.items.filter(function (t) { return t.status === 'done'; }).length;
    return h('section', { className: 'ic ic-tasks' },
      h('header', null, h('span', null, p.title || 'Tasks'), h('code', null, done + ' of ' + p.items.length)),
      h('ol', null, p.items.map(function (t, i) {
        return h('li', { key: i, className: 'ic-task-' + (t.status || 'pending') },
          h('span', { className: 'ic-task-mark' }, t.status === 'done' ? h(Glyph, { name: 'check', size: 12 }) : t.status === 'in_progress' ? h(Glyph, { name: 'loader', size: 12, className: 'ic-spin' }) : null),
          t.label);
      })));
  }

  function BranchStatus(p) {
    return h('span', { className: 'ic ic-branch' }, h(Glyph, { name: 'branch', size: 14 }), h('code', null, p.branch),
      p.changed ? h('span', null, p.changed + ' changed') : h('span', null, 'clean'),
      p.ahead ? h('span', null, p.ahead + ' ahead') : null);
  }

  var MODES = [
    { value: 'ask', label: 'Ask', title: 'Approve every edit and command.' },
    { value: 'auto_edit', label: 'Auto-edit', title: 'Edits apply freely; commands need approval.' },
    { value: 'full_auto', label: 'Full-auto', title: 'Everything runs inside the sandbox without prompts.' }
  ];

  function ApprovalModePicker(p) {
    var st = useState(p.defaultValue || 'auto_edit'), cur = p.value !== undefined ? p.value : st[0];
    var m = MODES.filter(function (x) { return x.value === cur; })[0];
    return h('span', { className: 'ic' }, h(Pick, { label: 'Approval mode', icon: 'shield', title: m.title, value: cur, options: MODES, onChange: function (v) { st[1](v); if (p.onChange) p.onChange(v); } }));
  }

  function ModelPicker(p) {
    var a = useState(p.defaultModel || p.models[0].value), b = useState(p.defaultEffort || 'medium');
    var efforts = p.efforts || [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];
    return h('span', { className: 'ic ic-picks' },
      h(Pick, { label: 'Model', value: a[0], options: p.models, onChange: function (v) { a[1](v); if (p.onModel) p.onModel(v); } }),
      h(Pick, { label: 'Reasoning effort', value: b[0], options: efforts, onChange: function (v) { b[1](v); if (p.onEffort) p.onEffort(v); } }));
  }

  function Composer(p) {
    var st = useState(''), text = st[0], busy = !!p.busy;
    function send() { if (!text.trim()) return; if (p.onSend) p.onSend(text); st[1](''); }
    return h('div', { className: 'ic ic-comp' },
      p.project || p.branch ? h('div', { className: 'ic-comp-context' },
        p.project ? h('button', { type: 'button', className: 'ic-comp-project' }, h(Glyph, { name: 'folder', size: 14 }), p.project, h(Glyph, { name: 'chevD', size: 12 })) : h('span', null),
        p.branch ? h(BranchStatus, p.branch) : null) : null,
      h('div', { className: 'ic-comp-box' },
        h('textarea', { 'aria-label': 'Message', rows: 2, value: text, placeholder: p.placeholder || (busy ? 'Steer the agent. It reads this at its next step.' : 'Describe the task. Type / for commands, @ for files.'), onChange: function (e) { st[1](e.target.value); }, onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } }),
        h('div', { className: 'ic-comp-row' },
          h(ApprovalModePicker, { defaultValue: p.mode }),
          h('div', { className: 'ic-comp-end' },
            p.models ? h(ModelPicker, { models: p.models, defaultModel: p.model, defaultEffort: p.effort }) : null,
            busy ? h('button', { type: 'button', className: 'ic-comp-stop', 'aria-label': 'Stop the turn', title: 'Stop the turn', onClick: p.onStop }, h(Glyph, { name: 'stop', size: 14 })) : null,
            h('button', { type: 'button', className: 'ic-comp-send', 'aria-label': busy ? 'Send steering message' : 'Send', title: busy ? 'Send steering message' : 'Send', disabled: !text.trim(), onClick: send }, h(Glyph, { name: 'up', size: 16 }))))));
  }

  function SessionMetrics(p) {
    var bits = [p.turns + ' turns ' + p.steps + ' steps', p.speed, p.tokens && p.tokens + ' tokens', p.cache && p.cache + ' cache hit', p.context && p.context + ' of context'].filter(Boolean);
    return h('div', { className: 'ic ic-metrics', role: 'group', 'aria-label': 'Session metrics' }, bits.map(function (b, i) { return h('span', { key: i }, b); }));
  }

  function PanelTabs(p) {
    var st = useState(p.defaultValue || (p.tabs[0] && p.tabs[0].id)), cur = p.value !== undefined ? p.value : st[0];
    return h('div', { className: 'ic ic-ptabs' },
      h('div', { className: 'ic-ptabs-list', role: 'tablist' }, p.tabs.map(function (t) {
        var on = t.id === cur;
        return h('div', { key: t.id, className: cx('ic-ptab', on && 'on') },
          h('button', { type: 'button', role: 'tab', 'aria-selected': on, onClick: function () { st[1](t.id); if (p.onChange) p.onChange(t.id); } }, h(Glyph, { name: t.icon || 'file', size: 14 }), t.label),
          h(IconBtn, { icon: 'x', size: 12, label: 'Close ' + t.label, onClick: function () { if (p.onClose) p.onClose(t.id); } }));
      }), h(IconBtn, { icon: 'plus', label: 'New tab', onClick: p.onNew })),
      p.onCollapse ? h(IconBtn, { icon: 'panel', label: 'Collapse panel', onClick: p.onCollapse }) : null);
  }

  var START = [
    { id: 'files', label: 'Workspace files', hint: 'Browse the project folder', icon: 'folder' },
    { id: 'changes', label: 'Code review and changes', hint: 'Every file this session touched', icon: 'pen' },
    { id: 'terminal', label: 'New terminal', hint: 'A shell in the project folder', icon: 'terminal' },
    { id: 'log', label: 'Session log', hint: 'The raw record of this session', icon: 'list' }
  ];

  function PanelStart(p) {
    return h('div', { className: 'ic ic-pstart' }, h('ul', null, START.map(function (e) {
      return h('li', { key: e.id }, h('button', { type: 'button', onClick: function () { if (p.onOpen) p.onOpen(e.id); } }, h(Glyph, { name: e.icon, size: 16 }), h('b', null, e.label), h('span', null, e.hint)));
    })));
  }

  function FileTree(p) {
    return h('div', { className: 'ic ic-files' },
      h('div', { className: 'ic-files-path' }, h('code', null, p.path)),
      h('ul', null, p.entries.map(function (e) {
        return h('li', { key: e.name }, h('button', { type: 'button', onClick: function () { if (p.onOpen) p.onOpen(e); } },
          h(Glyph, { name: e.dir ? 'folder' : 'file', size: 14 }), h('span', null, e.name), e.changed ? h('code', { className: 'ic-c-added' }, 'M') : null));
      })));
  }

  function DiffRow(l, i) {
    var cls = l.t === '+' ? 'ic-d-add' : l.t === '-' ? 'ic-d-del' : undefined;
    return h('div', { key: i, className: cx('ic-d-row', cls) }, h('span', { className: 'ic-ln' }, l.o || ''), h('span', { className: 'ic-ln' }, l.n || ''), h('span', { className: 'ic-d-sign' }, l.t === ' ' ? '' : l.t === '-' ? '−' : l.t), h('span', { className: 'ic-d-text' }, l.s));
  }

  function splitPairs(lines) {
    var out = [], i = 0;
    while (i < lines.length) {
      if (lines[i].t === ' ') { out.push([lines[i], lines[i]]); i++; continue; }
      var del = [], add = [];
      while (i < lines.length && lines[i].t === '-') del.push(lines[i++]);
      while (i < lines.length && lines[i].t === '+') add.push(lines[i++]);
      for (var k = 0; k < Math.max(del.length, add.length); k++) out.push([del[k] || null, add[k] || null]);
    }
    return out;
  }

  function SplitCell(l, side) {
    if (!l) return h('div', { className: 'ic-d-cell ic-d-empty' });
    var cls = l.t === '+' ? 'ic-d-add' : l.t === '-' ? 'ic-d-del' : undefined;
    return h('div', { className: cx('ic-d-cell', cls) }, h('span', { className: 'ic-ln' }, side === 0 ? l.o : l.n), h('span', { className: 'ic-d-sign' }, l.t === ' ' ? '' : l.t === '-' ? '−' : l.t), h('span', { className: 'ic-d-text' }, l.s));
  }

  function DiffView(p) {
    var split = p.view === 'split';
    return h('div', { className: cx('ic ic-diff', split && 'ic-diff-split') }, p.hunks.map(function (hk, x) {
      return h('div', { key: x },
        h('div', { className: 'ic-d-hunk' }, hk.header),
        split ? splitPairs(hk.lines).map(function (pr, i) { return h('div', { key: i, className: 'ic-d-pair' }, SplitCell(pr[0], 0), SplitCell(pr[1], 1)); }) : hk.lines.map(DiffRow));
    }));
  }

  function ChangedFiles(p) {
    var v = useState(p.defaultView || 'unified'), st = useState(p.defaultOpen || (p.files[0] ? [p.files[0].path] : [])), open = st[0];
    var add = p.files.reduce(function (n, f) { return n + f.added; }, 0), del = p.files.reduce(function (n, f) { return n + f.removed; }, 0);
    function toggle(x) { st[1](open.indexOf(x) >= 0 ? open.filter(function (y) { return y !== x; }) : open.concat(x)); }
    return h('section', { className: 'ic ic-changes' },
      h('header', null,
        h('span', { className: 'ic-ch-sum' }, h('b', null, p.files.length + ' files changed'), h('code', { className: 'ic-c-added' }, '+' + add), h('code', { className: 'ic-c-removed' }, '−' + del)),
        h('div', { className: 'ic-ch-actions' },
          h('div', { className: 'ic-seg', role: 'group', 'aria-label': 'Diff layout' }, ['unified', 'split'].map(function (m) { return h('button', { key: m, type: 'button', 'aria-pressed': v[0] === m, className: v[0] === m ? 'on' : undefined, onClick: function () { v[1](m); } }, m === 'unified' ? 'Unified' : 'Split'); })),
          h(Button, { size: 'sm', icon: 'undo', onClick: p.onRevertAll }, 'Revert all'))),
      h('ul', null, p.files.map(function (f) {
        var isOpen = open.indexOf(f.path) >= 0;
        return h('li', { key: f.path },
          h('div', { className: 'ic-ch-file' },
            h('button', { type: 'button', 'aria-expanded': isOpen, onClick: function () { toggle(f.path); } }, h(Glyph, { name: isOpen ? 'chevD' : 'chevR', size: 14 }), h('code', { className: 'ic-ch-path' }, f.path), h('code', { className: 'ic-c-added' }, '+' + f.added), h('code', { className: 'ic-c-removed' }, '−' + f.removed)),
            h(IconBtn, { icon: 'undo', size: 14, label: 'Revert ' + f.path, onClick: function () { if (p.onRevert) p.onRevert(f.path); } })),
          isOpen && f.hunks ? h(DiffView, { hunks: f.hunks, view: v[0] }) : null);
      })));
  }

  function TerminalView(p) {
    return h('div', { className: 'ic ic-term', role: 'log', 'aria-label': (p.shell || 'Terminal') + ' output' },
      p.lines.map(function (l, i) { return h('div', { key: i, className: l.cmd ? 'ic-term-cmd' : undefined }, l.cmd ? '$ ' + l.s : l.s); }),
      h('div', { className: 'ic-term-cmd' }, '$ ', h('span', { className: 'ic-term-cursor', 'aria-hidden': true })));
  }

  Object.assign(window.Clan = window.Clan || {}, {
    Logo: Logo, TradeSidebar: TradeSidebar, ProjectTree: ProjectTree, SessionHeader: SessionHeader, SandboxNotice: SandboxNotice, ChatMessage: ChatMessage, ReplyFooter: ReplyFooter,
    TurnStatus: TurnStatus, ProcessGroup: ProcessGroup, FileExcerpt: FileExcerpt, ToolApproval: ToolApproval, AgentQuestion: AgentQuestion, TaskList: TaskList,
    Composer: Composer, ApprovalModePicker: ApprovalModePicker, ModelPicker: ModelPicker, BranchStatus: BranchStatus, SessionMetrics: SessionMetrics,
    PanelTabs: PanelTabs, PanelStart: PanelStart, FileTree: FileTree, ChangedFiles: ChangedFiles, DiffView: DiffView, TerminalView: TerminalView
  });

})();
