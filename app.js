// 루틴 점검 — 화면
// 로컬판: index.html이 data/lib.js·data/defaults.js·core.js를 읽고, 기록은 이 브라우저 localStorage에만 둔다.
// 공개판: boot.js가 비밀번호로 d.bin을 풀어 RT_LIB·RT_DEFAULTS·RT_STORE(서버 저장 계정)를 넘긴다 → 기록은 서버(Supabase user_files)에 저장.
(function () {
  "use strict";
  var C = window.RT_CORE, LIB = window.RT_LIB, DEF = window.RT_DEFAULTS, STORE = window.RT_STORE || null;
  var root = document.getElementById("app");

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uid(p) { return (p || "x") + Math.random().toString(36).slice(2, 8); }

  var SVG = function (d, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + d + "</svg>"; };
  var ICON = {
    check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="3"'),
    ext: SVG('<path d="M7 17L17 7M9 7h8v8"/>'),
    chev: SVG('<path d="M9 6l6 6-6 6"/>'),
    back: SVG('<path d="M15 6l-6 6 6 6"/>'),
    left: SVG('<path d="M15 6l-6 6 6 6"/>'),
    right: SVG('<path d="M9 6l6 6-6 6"/>'),
    today: SVG('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8.5 14.5l2 2 4-4"/>'),
    ex: SVG('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
    chart: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    up: SVG('<path d="M6 15l6-6 6 6"/>'), down: SVG('<path d="M6 9l6 6 6-6"/>'),
    x: SVG('<path d="M6 6l12 12M18 6L6 18"/>'), plus: SVG('<path d="M12 5v14M5 12h14"/>')
  };

  // ---------- 상태 ----------
  var ST = lsGet("rt_state");
  if (!ST || !ST.cfg) ST = { cfg: clone(DEF), log: (ST && ST.log) || {}, upd: 0 };
  var CAL = lsGet("rt_cal");
  // 설정 고치기(한 번씩만). 바꾼 것이 있으면 true — 서버에서 받은 설정에도 돌려서 바뀌면 다시 올린다
  function migrate(c) {
    var ch = false;
    if (!c.customEx) { c.customEx = {}; ch = true; }
    if (!c.links) { c.links = clone(DEF.links); ch = true; }
    if (!c.notify) { c.notify = clone(DEF.notify); ch = true; }
    if (!c.cats) { c.cats = clone(DEF.cats); ch = true; }
    if (!c.start) { c.start = C.dkey(); ch = true; }
    c.mig = c.mig || {};
    // 2026-11-23 사용자 지시: 외국어 링크는 언어마다 따로 걸지 말고 외국어 공부 사이트 링크 하나만
    if (!c.mig.langLink) {
      (c.routines || []).forEach(function (r) {
        if (r.kind === "any" && (r.items || []).some(function (it) { return /^lang:/.test(it.link || ""); })) {
          r.items.forEach(function (it) { if (/^lang:/.test(it.link || "")) delete it.link; });
          if (!r.link) r.link = "lang";
        }
      });
      c.mig.langLink = 1; ch = true;
    }
    // 2026-11-23 사용자 지시: 모든 운동은 집에서 하는 맨몸 운동으로 → 책가방 운동을 맨몸 운동으로 바꾼다
    if (!c.mig.bodyweight) {
      (c.routines || []).forEach(function (r) {
        if (r.kind !== "workout" || !r.sessions) return;
        Object.keys(r.sessions).forEach(function (sid) {
          (r.sessions[sid].items || []).forEach(function (it) {
            if (it.ex === "bp_row") it.ex = "door_row";
            if (it.ex === "bp_rdl") { it.ex = "sl_rdl"; it.reps = "한 다리 8–10회"; }
          });
        });
        if (r.note) r.note = r.note.replace("(집에서 맨몸 + 책가방)", "(집에서 맨몸으로만)");
      });
      c.mig.bodyweight = 1; ch = true;
    }
    return ch;
  }
  migrate(ST.cfg);
  ST.log = ST.log || {};

  function cfg() { return ST.cfg; }
  function exOf(id) { return (cfg().customEx && cfg().customEx[id]) || LIB.exercises[id] || null; }
  function viewLib() { var l = { muscles: LIB.muscles, groups: LIB.groups, exercises: Object.assign({}, LIB.exercises, cfg().customEx || {}) }; return l; }
  function expand(ids) {
    var out = [], seen = {};
    (ids || []).forEach(function walk(id) {
      if (seen[id]) return; seen[id] = 1;
      if (LIB.groups[id]) LIB.groups[id].forEach(walk); else if (LIB.muscles[id]) out.push(id);
    });
    return out;
  }
  function catOf(id) { var c = null; cfg().cats.forEach(function (x) { if (x.id === id) c = x; }); return c; }
  function toneOf(id) { var c = catOf(id); return c && c.tone ? c.tone : "etc"; }
  function routineById(id) { var r = null; cfg().routines.forEach(function (x) { if (x.id === id) r = x; }); return r; }

  function saveLocal() { lsSet("rt_state", ST); }
  function touch(dk) {
    if (dk) { ST.log[dk] = ST.log[dk] || {}; ST.log[dk]._sum = Object.assign(C.summary(cfg(), CAL, ST.log, dk), { t: Date.now() }); }
    ST.upd = Date.now();
    saveLocal();
    markDirty();
  }
  function setN(dk, key, n) {
    ST.log[dk] = ST.log[dk] || {};
    ST.log[dk][key] = { n: n, t: Date.now() };
    touch(dk);
  }
  function saveCfg() { cfg().upd = Date.now(); touch(C.dkey()); }

  // ---------- 서버 저장 (공개판) ----------
  var P = STORE ? { state: STORE.path || "routine/state.json", push: STORE.pushPath || "routine/push.json", cal: STORE.calPath || "routine/calendar.json" } : null;
  var SY = { busy: false, again: false, dirty: false, state: STORE ? "ok" : "off", last: 0, timer: 0 };
  var AUTH = lsGet("rt_auth");
  function authPost(q, body) {
    return fetch(STORE.url + "/auth/v1/token?grant_type=" + q, { method: "POST", headers: { apikey: STORE.anon, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.access_token) throw new Error("로그인 실패"); return j; }); })
      .then(function (j) { AUTH = { at: j.access_token, rt: j.refresh_token, exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) }; lsSet("rt_auth", AUTH); return AUTH.at; });
  }
  function login() { return authPost("password", { email: STORE.email, password: STORE.password }); }
  function token(force) {
    if (!force && AUTH && AUTH.exp > Date.now() / 1000 + 90) return Promise.resolve(AUTH.at);
    if (AUTH && AUTH.rt) return authPost("refresh_token", { refresh_token: AUTH.rt }).catch(login);
    return login();
  }
  function rest(method, q, body, retried) {
    return token(retried).then(function (at) {
      return fetch(STORE.url + "/rest/v1/" + q, { method: method, headers: { apikey: STORE.anon, Authorization: "Bearer " + at, "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) {
      if (r.status === 401 && !retried) { AUTH = null; return rest(method, q, body, true); }
      if (r.status === 409) return { conflict: true };
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + " " + t.slice(0, 120)); });
      return r.status === 204 ? [] : r.json();
    });
  }
  function rowQ(path) { return "user_files?user_id=eq." + STORE.uid + "&path=eq." + encodeURIComponent(path); }
  function readRow(path) { return rest("GET", rowQ(path) + "&select=data,ver").then(function (rows) { return rows && rows[0] ? rows[0] : null; }); }
  function writeRow(path, data, ver) {
    if (ver == null) return rest("POST", "user_files", { user_id: STORE.uid, path: path, data: data, ver: 1 }).then(function (r) { return r && r.conflict ? null : 1; });
    return rest("PATCH", rowQ(path) + "&ver=eq." + ver, { data: data, ver: ver + 1 }).then(function (rows) { return rows && rows.length ? ver + 1 : null; });
  }
  function chip(s, msg) {
    SY.state = s;
    var el = document.getElementById("sync"); if (!el) return;
    el.hidden = !STORE;
    var t = SY.last ? new Date(SY.last) : null;
    el.className = "sync " + s;
    el.textContent = s === "busy" ? "저장 중…" : s === "err" ? "저장 안 됨" : "저장됨" + (t ? " " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") : "");
    el.title = msg || "기록은 서버에 저장됩니다. 누르면 지금 맞춥니다.";
  }
  function markDirty() {
    if (!STORE) return;
    SY.dirty = true; chip("busy");
    clearTimeout(SY.timer);
    SY.timer = setTimeout(syncNow, 1200);
  }
  function syncNow() {
    if (!STORE) return Promise.resolve();
    if (SY.busy) { SY.again = true; return Promise.resolve(); }
    SY.busy = true; chip("busy");
    var tries = 0, before = JSON.stringify(ST);
    function attempt() {
      return readRow(P.state).then(function (row) {
        var remote = row && row.data;
        var remoteStr = JSON.stringify(remote);
        var merged = remote ? C.mergeState(ST, clone(remote)) : ST;
        if (migrate(merged.cfg)) merged.cfg.upd = Date.now();
        ST = merged; saveLocal();
        if (row && remoteStr === JSON.stringify(merged)) return;
        return writeRow(P.state, merged, row ? row.ver : null).then(function (v) {
          if (v == null) { if (++tries < 4) return attempt(); throw new Error("다른 기기와 동시에 저장하는 중입니다."); }
        });
      });
    }
    return attempt().then(function () {
      return readRow(P.cal).then(function (row) { if (row && row.data) { CAL = row.data; lsSet("rt_cal", CAL); } });
    }).then(function () {
      SY.dirty = false; SY.last = Date.now(); chip("ok");
      if (JSON.stringify(ST) !== before && !EDITING) rerender();
    }).catch(function (e) {
      chip("err", "저장하지 못했습니다: " + (e && e.message || e) + " — 연결되면 다시 시도합니다.");
      clearTimeout(SY.timer); SY.timer = setTimeout(syncNow, 20000);
    }).then(function () {
      SY.busy = false;
      if (SY.again) { SY.again = false; syncNow(); }
    });
  }
  document.addEventListener("visibilitychange", function () { if (STORE && document.visibilityState === "visible") syncNow(); else if (STORE && SY.dirty) syncNow(); });

  // ---------- 틀 ----------
  var EDITING = false, VIEWER = null, CUR = { dk: null };
  root.innerHTML =
    '<header class="top" id="top"><div class="wrap"><button class="back" id="backBtn" hidden aria-label="뒤로">' + ICON.back + '</button><h1 id="ttl">오늘</h1><button class="sync" id="sync" hidden></button></div></header>' +
    '<main class="wrap" id="main"></main>' +
    '<nav class="tabs" id="tabs"><div class="wrap">' +
    '<a href="#/" data-tab="today">' + ICON.today + "오늘</a>" +
    '<a href="#/plan" data-tab="plan">' + ICON.ex + "운동</a>" +
    '<a href="#/history" data-tab="history">' + ICON.chart + "기록</a>" +
    '<a href="#/settings" data-tab="settings">' + ICON.gear + "설정</a></div></nav>";
  var main = document.getElementById("main");
  document.getElementById("sync").onclick = function () { syncNow(); };
  chip(SY.state);
  var BACK = null;
  document.getElementById("backBtn").onclick = function () { if (BACK) location.hash = BACK; else history.back(); };
  window.addEventListener("scroll", function () { document.getElementById("top").classList.toggle("scrolled", window.scrollY > 4); }, { passive: true });
  function setTop(title, back, tab) {
    document.getElementById("ttl").textContent = title;
    BACK = back || null;
    document.getElementById("backBtn").hidden = !back;
    document.querySelectorAll("#tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === tab); });
    document.title = title === "오늘" ? "루틴 점검" : title + " · 루틴 점검";
  }
  function toast(msg, ms) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  }

  // ---------- 길 ----------
  var keep = false;
  function rerender() { keep = true; route(); }
  window.addEventListener("hashchange", function () { route(); });
  function route() {
    var sy = window.scrollY;
    closeViewer(); closeSheet();
    EDITING = false;
    var h = location.hash.replace(/^#\/?/, ""), q = h.split("?"), p = q[0].split("/").map(decodeURIComponent);
    var qs = new URLSearchParams(q[1] || "");
    try {
      if (!p[0] || p[0] === "day") viewToday(p[1]);
      else if (p[0] === "ex") viewExercise(p[1], qs);
      else if (p[0] === "plan") viewPlan();
      else if (p[0] === "session") viewSession(p[1], p[2]);
      else if (p[0] === "muscles") viewMuscles();
      else if (p[0] === "muscle") viewMuscle(p[1]);
      else if (p[0] === "history") viewHistory(p[1]);
      else if (p[0] === "settings") viewSettings();
      else if (p[0] === "subjects") viewSubjects();
      else if (p[0] === "notify") viewNotify();
      else if (p[0] === "edit") viewEdit(p[1]);
      else viewToday();
    } catch (e) {
      main.innerHTML = '<div class="card"><h2>화면을 그리지 못했습니다</h2><p class="muted">' + esc(e && e.message || e) + "</p></div>";
      console.error(e);
    }
    window.scrollTo(0, keep ? sy : 0);
    keep = false;
  }

  // ---------- 링크 ----------
  function linkUrl(spec) {
    if (!spec) return null;
    var L = cfg().links || {};
    if (/^https?:/.test(spec)) return spec;
    if (spec === "medq") return L.medq && L.medq.url;
    if (spec.indexOf("lang") === 0) { var base = L.lang && L.lang.url; var lg = spec.split(":")[1]; return base ? base + (lg ? "#/" + lg : "") : null; }
    return null;
  }
  function linkName(spec) {
    var L = cfg().links || {};
    if (spec === "medq") return (L.medq && L.medq.name) || "KU MedQ";
    if (spec === "lang") return (L.lang && L.lang.name) || "외국어 공부";
    if (spec && spec.indexOf("lang:") === 0) return "공부하기";
    return "열기";
  }
  function goBtn(spec, label) {
    var u = linkUrl(spec); if (!u) return "";
    return '<a class="go" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label || linkName(spec)) + ICON.ext + "</a>";
  }

  // ---------- 오늘 ----------
  function ring(done, due) {
    var r = 32, c = 2 * Math.PI * r, f = due ? done / due : 0;
    return '<div class="ring"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="' + r + '" stroke="var(--line)" stroke-width="7" fill="none"/>' +
      '<circle cx="37" cy="37" r="' + r + '" stroke="' + (due && done >= due ? "var(--ok)" : "var(--ink)") + '" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + " " + c.toFixed(1) + '"/></svg>' +
      '<div class="lab">' + (due ? done + "/" + due : "—") + "<small>" + (due ? "루틴" : "쉬는 날") + "</small></div></div>";
  }
  function sayFor(dk, s) {
    var today = C.dkey();
    if (!s.due) return "오늘은 정해진 루틴이 없습니다.";
    if (s.done >= s.due) return dk === today ? "오늘 루틴을 모두 끝냈습니다." : "이날 루틴을 모두 끝냈습니다.";
    if (dk < today) return (s.due - s.done) + "개를 못 끝냈습니다. 지금 체크해도 됩니다.";
    if (dk > today) return "앞으로 할 루틴입니다.";
    return (s.due - s.done) + "개 남았습니다.";
  }
  function viewToday(dkp) {
    var today = C.dkey(), dk = /^\d{4}-\d\d-\d\d$/.test(dkp || "") ? dkp : today;
    CUR.dk = dk;
    setTop(dk === today ? "오늘" : C.label(dk), dk === today ? null : "#/", "today");
    var due = C.dueFor(cfg(), CAL, ST.log, dk), s = C.summary(cfg(), CAL, ST.log, dk);
    var h = '<section class="dayhead">' + ring(s.done, s.due) + '<div class="meta"><div class="date">' + esc(C.label(dk)) + '</div><div class="say">' + esc(sayFor(dk, s)) + "</div>" +
      '<div class="daynav"><a class="chipbtn" href="#/day/' + C.addDays(dk, -1) + '">' + ICON.left.replace("<svg", '<svg width="14" height="14"') + "전날</a>" +
      (dk !== today ? '<a class="chipbtn solid" href="#/">오늘로</a>' : "") +
      '<a class="chipbtn" href="#/day/' + C.addDays(dk, 1) + '">다음날' + ICON.right.replace("<svg", '<svg width="14" height="14"') + "</a></div></div></section>";
    cfg().cats.forEach(function (cat) {
      var Ds = due.filter(function (D) { return D.r.cat === cat.id; });
      var waiting = cfg().routines.filter(function (r) { return r.cat === cat.id && !r.off && r.when && r.when.type === "major" && !Ds.some(function (D) { return D.r === r; }); });
      if (!Ds.length && !waiting.length) return;
      var real = Ds.filter(function (D) { return !D.rest; }), doneN = real.filter(function (D) { return C.status(D, ST.log, dk).complete; }).length;
      h += '<section class="cat" data-tone="' + esc(toneOf(cat.id)) + '"><div class="cat-h"><span class="dot"></span><h2>' + esc(cat.name) + "</h2>" +
        (real.length ? '<span class="cnt' + (doneN >= real.length ? " done" : "") + '">' + (doneN >= real.length ? "완료" : doneN + "/" + real.length) + "</span>" : "") + "</div>";
      Ds.forEach(function (D) { h += routineHTML(D, dk, due.indexOf(D)); });
      waiting.forEach(function (r) {
        h += '<div class="rt"><div class="rt-h"><h3>' + esc(r.title) + '</h3></div><div class="empty">' + majorLine(dk) + "</div></div>";
      });
      h += "</section>";
    });
    if (!due.length && !cfg().routines.some(function (r) { return r.when && r.when.type === "major"; })) h += '<div class="card"><p class="muted">루틴이 없습니다. 설정에서 추가해 주십시오.</p></div>';
    var L = cfg().links || {};
    h += '<div class="btns" style="margin-bottom:8px">' + (L.medq ? '<a class="btn ghost sm" href="' + esc(L.medq.url) + '" target="_blank" rel="noopener">' + esc(L.medq.name) + ICON.ext.replace("<svg", '<svg width="14" height="14"') + "</a>" : "") +
      (L.lang ? '<a class="btn ghost sm" href="' + esc(L.lang.url) + '" target="_blank" rel="noopener">' + esc(L.lang.name) + ICON.ext.replace("<svg", '<svg width="14" height="14"') + "</a>" : "") + "</div>";
    main.innerHTML = h;
    main.onclick = onTodayClick;
  }
  function majorLine(dk) {
    var src = C.majorSource(cfg(), CAL, ST.log, dk), subs = C.majorsOn(cfg(), CAL, ST.log, dk);
    var why = src === "manual" ? "직접 바꾼 날" : src === "calendar" ? "iCloud 시간표 기준" : C.WD[C.wday(dk)] + "요일 시간표 기준";
    return (subs.length ? "" : "전공 수업이 없는 날입니다 · ") + '<span class="small">' + esc(why) + '</span> <button class="chipbtn" data-act="major">' + (subs.length ? "과목 바꾸기" : "수업 있는 날로") + "</button>";
  }
  function ckBtn(on, attrs) {
    return '<button class="ck' + (on ? " on" : "") + '" ' + attrs + ' aria-pressed="' + (on ? "true" : "false") + '">' + ICON.check + "</button>";
  }
  function musShort(e) {
    return expand(e.primary).slice(0, 3).map(function (id) { return LIB.muscles[id].en; }).join(" · ");
  }
  function routineHTML(D, dk, di) {
    var r = D.r, st = C.status(D, ST.log, dk), h = '<div class="rt">';
    var sub = r.kind === "any" ? D.min + "개 이상" : r.kind === "workout" ? (D.rest ? "" : esc(D.session.s.name)) : r.kind === "steps" ? "순서대로" : "";
    h += '<div class="rt-h"><h3>' + esc(r.title) + "</h3>" + (sub ? '<span class="sub">' + sub + "</span>" : "") +
      (r.kind === "workout" && !D.rest ? '<a class="go act" href="#/session/' + esc(r.id) + "/" + esc(D.session.id) + '">근육 보기</a>' : "") +
      (r.link && linkUrl(r.link) ? goBtn(r.link).replace('class="go"', 'class="go act"') : "") + "</div>";
    if (r.when && r.when.type === "major") h += '<div class="note">' + majorLine(dk) + "</div>";
    if (r.kind === "workout") {
      if (D.rest) return h + '<div class="empty">오늘은 쉬는 날입니다. 잘 자는 것도 운동입니다.</div></div>';
      if (D.min) h += '<div class="note">' + (D.groups[0].items.length > 1 ? "둘 중 하나만 해도 됩니다." : "") + "</div>";
      D.groups[0].items.forEach(function (it) {
        var e = exOf(it.ex) || { name: it.ex, primary: [] }, n = C.nOf(ST.log, dk, it.key), done = n >= it.need;
        h += '<div class="exrow' + (done ? " done" : "") + '">';
        if (it.need > 1) {
          h += '<div class="sets">';
          for (var i = 0; i < it.need; i++) h += '<button class="set' + (i < n ? " on" : "") + '" data-act="set" data-key="' + esc(it.key) + '" data-i="' + i + '" data-need="' + it.need + '" data-rest="' + (e.rest || 0) + '" aria-label="' + (i + 1) + '세트">' + (i + 1) + "</button>";
          h += "</div>";
        } else h += ckBtn(done, 'data-act="ck" data-key="' + esc(it.key) + '" data-need="1"');
        h += '<a class="txt" href="#/ex/' + esc(it.ex) + "?r=" + esc(r.id) + "&s=" + esc(D.session.id) + "&d=" + dk + '"><div class="t">' + esc(it.t || e.name) + '</div><div class="h">' + esc(it.reps || "") + (it.need > 1 ? " × " + it.need + "세트" : "") + "</div>" +
          (e.primary && e.primary.length ? '<div class="mus en">' + esc(musShort(e)) + "</div>" : "") + "</a>" +
          '<span class="chev">' + ICON.chev + "</span></div>";
      });
      return h + "</div>";
    }
    if (r.note && r.kind !== "steps") h += '<div class="note">' + esc(r.note) + "</div>";
    if (r.kind === "any") {
      h += '<div class="opts">';
      D.groups[0].items.forEach(function (it) {
        var on = C.nOf(ST.log, dk, it.key) >= 1;
        h += '<div class="opt' + (on ? " on" : "") + '">' + ckBtn(on, 'data-act="ck" data-key="' + esc(it.key) + '" data-need="1"') + '<span class="t">' + esc(it.t) + "</span>" + goBtn(it.link) + "</div>";
      });
      return h + "</div></div>";
    }
    D.groups.forEach(function (g, gi) {
      var gs = st.groups[gi];
      if (D.groups.length > 1 || g.title) h += '<div class="subj"><div class="subj-t">' + esc(g.title || "") + (gs.done >= gs.total ? ' <span class="small" style="color:var(--ok)">완료</span>' : "") + "</div>";
      g.items.forEach(function (it, ii) {
        var on = C.nOf(ST.log, dk, it.key) >= it.need;
        var isNext = r.kind === "steps" && !on && gs.next === it;
        h += '<div class="row' + (on ? " done" : "") + (isNext ? " next" : "") + '">' +
          (r.kind === "steps" ? '<span class="stepno">' + (ii + 1) + "</span>" : "") +
          ckBtn(on, 'data-act="ck" data-key="' + esc(it.key) + '" data-need="' + it.need + '"') +
          '<div class="txt"><div class="t">' + esc(it.t) + "</div>" + (it.hint ? '<div class="h">' + esc(it.hint) + "</div>" : "") + "</div>" + goBtn(it.link, it.link === "medq" ? null : undefined) + "</div>";
      });
      if (D.groups.length > 1 || g.title) h += "</div>";
    });
    return h + "</div>";
  }
  function onTodayClick(e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var dk = CUR.dk, act = b.dataset.act;
    if (act === "major") { majorSheet(dk); return; }
    if (act === "ck") {
      var key = b.dataset.key, need = +b.dataset.need || 1, cur = C.nOf(ST.log, dk, key);
      setN(dk, key, cur >= need ? 0 : need);
      if (navigator.vibrate && cur < need) navigator.vibrate(12);
      rerender();
      return;
    }
    if (act === "set") {
      var k = b.dataset.key, i = +b.dataset.i, nd = +b.dataset.need, c0 = C.nOf(ST.log, dk, k);
      var n = c0 === i + 1 ? i : i + 1;
      setN(dk, k, n);
      if (n > c0 && n < nd && +b.dataset.rest > 0) startTimer(+b.dataset.rest);
      if (n >= nd) stopTimer();
      rerender();
    }
  }

  // 전공 수업 바꾸기
  var SHEET = null;
  function closeSheet() { if (SHEET) { SHEET.remove(); SHEET = null; } }
  function sheet(html, bind) {
    closeSheet();
    SHEET = document.createElement("div"); SHEET.className = "sheet-bg";
    SHEET.innerHTML = '<div class="sheet" role="dialog">' + html + "</div>";
    SHEET.addEventListener("click", function (e) { if (e.target === SHEET) closeSheet(); });
    document.body.appendChild(SHEET);
    bind(SHEET);
  }
  function majorSheet(dk) {
    var cur = C.majorsOn(cfg(), CAL, ST.log, dk), subs = cfg().subjects.filter(function (s) { return s.study; });
    var h = "<h2>" + esc(C.label(dk)) + " 전공 수업</h2><p class='lead'>이날 수업이 있었던 과목을 고릅니다. 휴강·보강·시험 날에 씁니다.</p><div class='seg' id='mjList'>";
    subs.forEach(function (s) { h += '<label><input type="checkbox" value="' + esc(s.id) + '"' + (cur.indexOf(s.id) >= 0 ? " checked" : "") + ">" + esc(s.name) + "</label>"; });
    h += "</div><div class='btns'><button class='btn' id='mjSave'>저장</button><button class='btn ghost' id='mjNone'>수업 없음</button>" +
      (ST.log[dk] && ST.log[dk]._major && ST.log[dk]._major.v ? "<button class='btn ghost' id='mjReset'>원래대로</button>" : "") + "</div>";
    sheet(h, function (el) {
      function put(v) { ST.log[dk] = ST.log[dk] || {}; ST.log[dk]._major = { v: v, t: Date.now() }; touch(dk); closeSheet(); rerender(); }
      el.querySelector("#mjSave").onclick = function () { put([].slice.call(el.querySelectorAll("#mjList input:checked")).map(function (x) { return x.value; })); };
      el.querySelector("#mjNone").onclick = function () { put([]); };
      var r = el.querySelector("#mjReset"); if (r) r.onclick = function () { put(null); };
    });
  }

  // 쉬는 시간
  var TM = null;
  function stopTimer() { if (TM) { clearInterval(TM.iv); TM.el.remove(); TM = null; } }
  function startTimer(sec) {
    stopTimer();
    var el = document.createElement("div"); el.className = "timer";
    var end = Date.now() + sec * 1000;
    el.innerHTML = '<span id="tmT"></span><button type="button">+15초</button><button type="button">건너뛰기</button>';
    document.body.appendChild(el);
    var bs = el.querySelectorAll("button");
    bs[0].onclick = function () { end += 15000; tick(); };
    bs[1].onclick = stopTimer;
    function tick() {
      var s = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.querySelector("#tmT").textContent = "쉬는 시간 " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      if (s <= 0) { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); stopTimer(); toast("다음 세트를 시작합니다."); }
    }
    TM = { el: el, iv: setInterval(tick, 250) };
    tick();
  }

  // ---------- 3D ----------
  function closeViewer() { if (VIEWER) { try { VIEWER.dispose(); } catch (e) {} VIEWER = null; } }
  function openViewer(el, opts) {
    var token = {};
    VIEWER = { dispose: function () { token.dead = true; }, set: function () {} };
    import("./viewer.js").then(function (m) {
      if (token.dead || !el.isConnected) return;
      return m.mount(el, Object.assign({ lib: viewLib() }, opts)).then(function (v) {
        if (token.dead) { v.dispose(); return; }
        VIEWER = v;
      });
    }).catch(function (e) { el.innerHTML = '<div class="v3d-load">3D 보기를 열지 못했습니다' + (e && e.message ? " (" + esc(e.message) + ")" : "") + ".</div>"; });
  }
  function musList(ids, cls) {
    return expand(ids).map(function (id) {
      var m = LIB.muscles[id];
      return '<button class="pill ' + cls + ' en" data-act="solo" data-id="' + id + '" title="' + esc(m.action) + '">' + esc(m.en) + "</button>";
    }).join("");
  }
  function musTable(ids) {
    return expand(ids).map(function (id) {
      var m = LIB.muscles[id];
      return '<div class="li"><div class="grow"><div class="t en">' + esc(m.en) + '</div><div class="h en">' + esc(m.action) + "</div></div></div>";
    }).join("");
  }

  // ---------- 운동 ----------
  function viewExercise(id, qs) {
    var e = exOf(id);
    if (!e) { setTop("운동", "#/plan", "plan"); main.innerHTML = '<div class="card">없는 운동입니다.</div>'; return; }
    var back = qs && qs.get("d") ? (qs.get("d") === C.dkey() ? "#/" : "#/day/" + qs.get("d")) : qs && qs.get("from") ? "#/" + qs.get("from") : "#/plan";
    setTop(e.name, back, back.indexOf("#/plan") === 0 || back.indexOf("#/session") === 0 ? "plan" : back.indexOf("#/muscle") === 0 ? "plan" : "today");
    var h = '<p class="lead"><span class="en" style="font-weight:700;color:var(--ink)">' + esc(e.en || "") + "</span>" + (e.perSide ? " · 좌우 각각" : "") + "</p>";
    var has3d = (e.primary && e.primary.length) || (e.secondary && e.secondary.length);
    if (has3d) h += '<div class="v3d" id="v3d"></div><p class="hint3d">끌어서 돌리고 두 손가락으로 확대합니다. 근육을 누르면 영어 이름이 나옵니다. 아래 근육 이름을 누르면 그 근육만 보입니다.</p>';
    // 오늘 이 운동을 하는 날이면 세트 체크
    var dk = qs && qs.get("d"), rid = qs && qs.get("r"), sid = qs && qs.get("s");
    if (dk && rid) {
      C.dueFor(cfg(), CAL, ST.log, dk).forEach(function (D) {
        if (D.r.id !== rid || !D.session || D.session.id !== sid) return;
        D.groups[0].items.forEach(function (it) {
          if (it.ex !== id) return;
          var n = C.nOf(ST.log, dk, it.key);
          h += '<div class="card" data-tone="ex" style="--tone:var(--ex)"><div class="rt-h"><h3>' + esc(C.label(dk)) + '</h3><span class="sub">' + esc(it.reps || "") + (it.need > 1 ? " × " + it.need + "세트" : "") + "</span></div><div class='sets' style='gap:8px'>";
          for (var i = 0; i < it.need; i++) h += '<button class="set' + (i < n ? " on" : "") + '" style="width:40px;height:40px" data-act="set" data-key="' + esc(it.key) + '" data-i="' + i + '" data-need="' + it.need + '" data-rest="' + (e.rest || 0) + '">' + (i + 1) + "</button>";
          h += "</div></div>";
        });
      });
    }
    if (has3d) {
      h += '<div class="card"><h2>자극되는 근육</h2>' +
        (e.primary && e.primary.length ? '<div class="small muted" style="margin:2px 0 4px">주로 쓰는 근육 (primary movers)</div><div>' + musList(e.primary, "pri") + "</div>" : "") +
        (e.secondary && e.secondary.length ? '<div class="small muted" style="margin:10px 0 4px">함께 쓰는 근육 (synergists · stabilizers)</div><div>' + musList(e.secondary, "sec") + "</div>" : "") +
        '<div style="margin-top:8px"><button class="pill" data-act="all">모두 보기</button></div>' +
        '<h3>근육별 작용</h3><div class="list">' + musTable((e.primary || []).concat(e.secondary || [])) + "</div></div>";
    }
    h += '<div class="card"><h2>이렇게 합니다</h2><ol class="how">' + (e.how || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" +
      (e.effect ? "<h3>효과</h3><p style='margin:4px 0'>" + esc(e.effect) + "</p>" : "") +
      '<dl class="kv">' + (e.easier ? "<dt>쉽게</dt><dd>" + esc(e.easier) + "</dd>" : "") + (e.harder ? "<dt>어렵게</dt><dd>" + esc(e.harder) + "</dd>" : "") +
      (e.rest ? "<dt>세트 사이</dt><dd>" + e.rest + "초 쉬기</dd>" : "") + (e.caution ? "<dt>주의</dt><dd>" + esc(e.caution) + "</dd>" : "") + "</dl></div>";
    if (e.sub) {
      h += '<div class="card"><h2>순서</h2><div class="list">' + e.sub.map(function (sid2, i) {
        var s = exOf(sid2); if (!s) return "";
        return '<a class="li" href="#/ex/' + sid2 + "?from=" + encodeURIComponent("ex/" + id) + '"><span class="stepno">' + (i + 1) + '</span><div class="grow"><div class="t">' + esc(s.name) + '</div><div class="h en">' + esc(musShort(s)) + "</div></div>" + ICON.chev + "</a>";
      }).join("") + "</div></div>";
    }
    main.innerHTML = h;
    var cur = { primary: e.primary || [], secondary: e.secondary || [] };
    main.onclick = function (ev) {
      var b = ev.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "solo") {
        main.querySelectorAll("[data-act=solo]").forEach(function (x) { x.classList.toggle("sel", x === b); });
        if (VIEWER) VIEWER.set({ primary: [b.dataset.id], secondary: [] });
        var v = document.getElementById("v3d"); if (v) v.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (b.dataset.act === "all") {
        main.querySelectorAll("[data-act=solo]").forEach(function (x) { x.classList.remove("sel"); });
        if (VIEWER) VIEWER.set(cur);
      } else if (b.dataset.act === "set") {
        var k = b.dataset.key, i = +b.dataset.i, nd = +b.dataset.need, c0 = C.nOf(ST.log, dk, k), n = c0 === i + 1 ? i : i + 1;
        setN(dk, k, n);
        if (n > c0 && n < nd && +b.dataset.rest > 0) startTimer(+b.dataset.rest);
        main.querySelectorAll('[data-act=set][data-key="' + k + '"]').forEach(function (x, j) { x.classList.toggle("on", j < n); });
      }
    };
    if (has3d) openViewer(document.getElementById("v3d"), cur);
  }

  function weekOrder() { return [1, 2, 3, 4, 5, 6, 0]; }
  function sessionShort(sid, s) { return sid === "rest" ? "쉼" : sid === "light" ? "가볍게" : sid.length <= 2 ? sid : (s && s.name || sid).slice(0, 4); }
  function viewPlan() {
    setTop("운동", null, "plan");
    var r = cfg().routines.filter(function (x) { return x.kind === "workout"; })[0];
    var h = "";
    if (!r) { main.innerHTML = '<div class="card"><p>운동 루틴이 없습니다.</p><a class="btn" href="#/edit/new?kind=workout">운동 루틴 만들기</a></div>'; return; }
    var tw = C.wday(C.dkey());
    h += '<div class="card"><h2>한 주 계획</h2><div class="week">' + weekOrder().map(function (w) {
      var sid = r.week[w], s = r.sessions[sid], str = s && s.items && s.items.length && !s.any;
      return '<div class="' + (str ? "str" : "") + (w === tw ? " today" : "") + '"><b>' + C.WD[w] + "</b>" + esc(sessionShort(sid, s)) + "</div>";
    }).join("") + "</div>" +
      '<h3>이렇게 짰습니다</h3><ul style="margin:4px 0;padding-left:18px;font-size:14px">' +
      "<li><b>근력은 주 3번(화·목·토), 30분 안팎.</b> 세 번 모두 온몸을 나눠 쓰되 A는 하체·밀기, B는 등·몸 뒤쪽, C는 한 다리·어깨·옆구리에 무게를 둡니다. 큰 근육마다 한 주에 두 번 이상 자극이 가도록 맞췄습니다.</li>" +
      "<li><b>집에서, 맨몸으로만.</b> 기구 없이 바닥·벽·의자·문틀만 씁니다. 무게를 더하는 대신 템포(천천히 내리기), 멈춤, 한쪽씩 하기로 어렵게 만듭니다. 운동은 설정 → 루틴 → 운동에서 바꿀 수 있습니다.</li>" +
      "<li><b>월·수·금은 가볍게.</b> 빠르게 걷기 30분이나 스트레칭 10분 중 하나면 그날 운동은 끝입니다. 등하교를 걸어도 칩니다. 일요일은 쉽니다.</li>" +
      "<li><b>늘리는 규칙.</b> 모든 세트를 범위의 위쪽 횟수로 자세를 지키며 두 번 연속 해내면, 다음 주에 그 운동의 ‘어렵게’ 단계(느리게·멈춤·한쪽씩)로 바꿉니다.</li>" +
      "<li><b>아프면 멈춥니다.</b> 근육이 뻐근한 것은 괜찮지만 관절이 찌르듯 아프면 그 운동은 ‘쉽게’ 단계로 바꿉니다.</li></ul>" +
      '<div class="btns"><a class="btn ghost sm" href="#/muscles">근육 사전</a><a class="btn ghost sm" href="#/edit/' + esc(r.id) + '">운동 바꾸기</a></div></div>';
    Object.keys(r.sessions).forEach(function (sid) {
      var s = r.sessions[sid]; if (!s.items || !s.items.length) return;
      var days = weekOrder().filter(function (w) { return r.week[w] === sid; }).map(function (w) { return C.WD[w]; }).join("·");
      h += '<div class="card"><div class="rt-h"><h3 style="font-size:16px">' + esc(s.name) + '</h3><span class="sub">' + esc(days || "요일 없음") + (s.any ? " · " + s.any + "개 이상" : "") + '</span><a class="go act" href="#/session/' + esc(r.id) + "/" + esc(sid) + '">근육 보기</a></div><div class="list">';
      s.items.forEach(function (it) {
        var e = exOf(it.ex) || { name: it.ex, primary: [] };
        h += '<a class="li" href="#/ex/' + esc(it.ex) + '?from=plan"><div class="grow"><div class="t">' + esc(it.t || e.name) + ' <span class="small muted">' + esc(it.reps || "") + (+it.sets > 1 ? " × " + it.sets + "세트" : "") + '</span></div><div class="h en">' + esc(musShort(e) || (e.en || "")) + "</div></div>" + ICON.chev + "</a>";
      });
      h += "</div></div>";
    });
    main.innerHTML = h;
    main.onclick = null;
  }
  function viewSession(rid, sid) {
    var r = routineById(rid), s = r && r.sessions && r.sessions[sid];
    if (!s) { location.hash = "#/plan"; return; }
    setTop(s.name, "#/plan", "plan");
    var pri = [], sec = [];
    s.items.forEach(function (it) { var e = exOf(it.ex); if (!e) return; pri = pri.concat(e.primary || []); sec = sec.concat(e.secondary || []); });
    var P2 = expand(pri), S2 = expand(sec).filter(function (x) { return P2.indexOf(x) < 0; });
    var h = '<p class="lead">이 세션에서 쓰는 근육을 모두 칠했습니다. 운동을 누르면 그 운동의 근육만 봅니다.</p><div class="v3d" id="v3d"></div>' +
      '<div class="card"><h2>운동</h2><div>' + s.items.map(function (it) { var e = exOf(it.ex) || { name: it.ex }; return '<button class="pill" data-act="ex" data-ex="' + esc(it.ex) + '">' + esc(it.t || e.name) + "</button>"; }).join("") +
      '<button class="pill" data-act="all">모두</button></div><h3>주로 쓰는 근육</h3><div>' + musList(P2, "pri") + "</div>" + (S2.length ? "<h3>함께 쓰는 근육</h3><div>" + musList(S2, "sec") + "</div>" : "") + "</div>" +
      '<div class="card"><div class="list">' + s.items.map(function (it) { var e = exOf(it.ex) || { name: it.ex }; return '<a class="li" href="#/ex/' + esc(it.ex) + "?from=" + encodeURIComponent("session/" + rid + "/" + sid) + '"><div class="grow"><div class="t">' + esc(it.t || e.name) + '</div><div class="h">' + esc(it.reps || "") + (+it.sets > 1 ? " × " + it.sets + "세트" : "") + "</div></div>" + ICON.chev + "</a>"; }).join("") + "</div></div>";
    main.innerHTML = h;
    var all = { primary: P2, secondary: S2 };
    main.onclick = function (ev) {
      var b = ev.target.closest("[data-act]"); if (!b || !VIEWER) return;
      main.querySelectorAll(".pill").forEach(function (x) { x.classList.toggle("sel", x === b && b.dataset.act !== "all"); });
      if (b.dataset.act === "ex") { var e = exOf(b.dataset.ex); VIEWER.set({ primary: e.primary || [], secondary: e.secondary || [] }); }
      else if (b.dataset.act === "solo") VIEWER.set({ primary: [b.dataset.id], secondary: [] });
      else VIEWER.set(all);
    };
    openViewer(document.getElementById("v3d"), all);
  }
  function viewMuscles() {
    setTop("근육 사전", "#/plan", "plan");
    var by = {};
    Object.keys(LIB.muscles).forEach(function (id) { var m = LIB.muscles[id]; (by[m.region] = by[m.region] || []).push(id); });
    var h = '<p class="lead">운동 사전에 나오는 근육입니다. 누르면 3D 모형에서 위치와 그 근육을 쓰는 운동을 봅니다.</p>';
    Object.keys(LIB.regions).forEach(function (rg) {
      if (!by[rg]) return;
      h += '<div class="sec-t en">' + esc(LIB.regions[rg]) + '</div><div class="card list" style="padding:4px 16px">' + by[rg].map(function (id) {
        var m = LIB.muscles[id];
        return '<a class="li" href="#/muscle/' + id + '"><div class="grow"><div class="t en">' + esc(m.en) + (m.deep ? ' <span class="small muted">deep</span>' : "") + '</div><div class="h en">' + esc(m.action) + "</div></div>" + ICON.chev + "</a>";
      }).join("") + "</div>";
    });
    main.innerHTML = h;
    main.onclick = null;
  }
  function viewMuscle(id) {
    var m = LIB.muscles[id];
    if (!m) { location.hash = "#/muscles"; return; }
    setTop(m.en, "#/muscles", "plan");
    var L = viewLib().exercises, pri = [], sec = [];
    Object.keys(L).forEach(function (k) {
      var e = L[k];
      if (expand(e.primary).indexOf(id) >= 0) pri.push(k); else if (expand(e.secondary).indexOf(id) >= 0) sec.push(k);
    });
    var li = function (k) { return '<a class="li" href="#/ex/' + k + "?from=" + encodeURIComponent("muscle/" + id) + '"><div class="grow"><div class="t">' + esc(L[k].name) + '</div><div class="h en">' + esc(L[k].en || "") + "</div></div>" + ICON.chev + "</a>"; };
    var h = '<p class="lead en" style="color:var(--ink)">' + esc(m.action) + "</p>" + '<div class="v3d" id="v3d"></div>' +
      (m.deep ? '<p class="hint3d">깊은 근육이라 겉근육을 반투명하게(투시) 보여 줍니다.</p>' : "") +
      '<div class="card"><h2>이 근육을 쓰는 운동</h2>' + (pri.length ? '<div class="small muted">주로 쓰는 운동</div><div class="list">' + pri.map(li).join("") + "</div>" : "") +
      (sec.length ? '<div class="small muted" style="margin-top:10px">함께 쓰는 운동</div><div class="list">' + sec.map(li).join("") + "</div>" : "") +
      (!pri.length && !sec.length ? '<p class="muted">아직 이 근육을 쓰는 운동이 사전에 없습니다.</p>' : "") + "</div>";
    main.innerHTML = h;
    main.onclick = null;
    openViewer(document.getElementById("v3d"), { primary: [id], secondary: [] });
  }

  // ---------- 기록 ----------
  function sumOf(dk) {
    var s = ST.log[dk] && ST.log[dk]._sum;
    if (s && dk < C.dkey()) return s;
    return C.summary(cfg(), CAL, ST.log, dk);
  }
  function streak() {
    var dk = C.dkey(), n = 0, s = sumOf(dk);
    if (!(s.due && s.done >= s.due)) dk = C.addDays(dk, -1); // 오늘을 아직 못 끝냈으면 어제부터 센다
    for (var i = 0; i < 400; i++) {
      if (dk < cfg().start) break;
      s = sumOf(dk);
      if (!s.due) { dk = C.addDays(dk, -1); continue; }
      if (s.done >= s.due) { n++; dk = C.addDays(dk, -1); } else break;
    }
    return n;
  }
  function viewHistory(month) {
    setTop("기록", null, "history");
    var today = C.dkey(), ym = /^\d{4}-\d\d$/.test(month || "") ? month : today.slice(0, 7);
    var first = ym + "-01", w0 = C.wday(first), mdays = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    var prevM = C.addDays(first, -1).slice(0, 7), nextM = C.addDays(ym + "-" + String(mdays).padStart(2, "0"), 1).slice(0, 7);
    // 최근 7·30일
    function rate(n, cat) {
      var d = 0, t = 0;
      for (var i = 0; i < n; i++) {
        var dk = C.addDays(today, -i); if (dk < cfg().start) break;
        var s = sumOf(dk);
        if (cat) { var c = s.cats && s.cats[cat]; if (c) { d += c[0]; t += c[1]; } } else { d += s.done; t += s.due; }
      }
      return t ? Math.round(d / t * 100) : null;
    }
    var r7 = rate(7), r30 = rate(30);
    var h = '<div class="stats"><div class="stat"><b>' + streak() + "일</b><span>연속 달성</span></div>" +
      '<div class="stat"><b>' + (r7 == null ? "—" : r7 + "%") + "</b><span>최근 7일</span></div>" +
      '<div class="stat"><b>' + (r30 == null ? "—" : r30 + "%") + "</b><span>최근 30일</span></div></div>";
    h += '<div class="card" style="margin-top:14px"><div class="monthnav"><a class="chipbtn" href="#/history/' + prevM + '">' + ICON.left.replace("<svg", '<svg width="14" height="14"') + "</a><b>" + (+ym.slice(0, 4)) + "년 " + (+ym.slice(5)) + '월</b><a class="chipbtn" href="#/history/' + nextM + '">' + ICON.right.replace("<svg", '<svg width="14" height="14"') + "</a></div><div class='cal'>";
    C.WD.forEach(function (w) { h += '<div class="wd">' + w + "</div>"; });
    for (var i = 0; i < w0; i++) h += '<span class="blank"></span>';
    for (var d = 1; d <= mdays; d++) {
      var dk = ym + "-" + String(d).padStart(2, "0"), s = sumOf(dk), fut = dk > today, before = dk < cfg().start;
      var dots = cfg().cats.map(function (c) { var x = s.cats && s.cats[c.id]; if (!x) return ""; return "<i class='" + (x[0] >= x[1] && !fut && !before ? esc(toneOf(c.id)) : "") + "'></i>"; }).join("");
      h += '<a href="#/day/' + dk + '" class="' + (dk === today ? "today " : "") + (fut || before ? "future " : "") + (!fut && !before && s.due && s.done >= s.due ? "full" : "") + '">' + d + '<span class="dots">' + dots + "</span></a>";
    }
    h += '</div><p class="small muted" style="margin:10px 0 0">초록 칸은 그날 루틴을 모두 끝낸 날, 점은 분류별(학교·외국어·운동) 완료입니다. 날짜를 누르면 그날 체크를 고칠 수 있습니다.</p></div>';
    // 분류별
    h += '<div class="card"><h2>분류별 달성률 (최근 30일)</h2><div class="bars">';
    cfg().cats.forEach(function (c) {
      var v = rate(30, c.id); if (v == null) return;
      h += '<div class="bar" style="--tone:var(--' + esc(toneOf(c.id) === "etc" ? "muted" : toneOf(c.id)) + ')"><span>' + esc(c.name) + '</span><div class="track"><div class="fill" style="width:' + v + '%"></div></div><span class="v">' + v + "%</span></div>";
    });
    h += "</div>";
    // 외국어: 언어별 횟수
    var lr = cfg().routines.filter(function (r) { return r.kind === "any"; });
    lr.forEach(function (r) {
      var cnt = {}, tot = 0;
      for (var i2 = 0; i2 < 30; i2++) {
        var dk2 = C.addDays(today, -i2), L = ST.log[dk2]; if (!L) continue;
        r.items.forEach(function (it) { if (L[r.id + "/_/" + it.id] && L[r.id + "/_/" + it.id].n >= 1) { cnt[it.id] = (cnt[it.id] || 0) + 1; tot++; } });
      }
      h += "<h3>" + esc(r.title) + " — 최근 30일에 한 날</h3><div class='bars'>" + r.items.map(function (it) {
        var n = cnt[it.id] || 0;
        return '<div class="bar" style="--tone:var(--' + esc(toneOf(r.cat)) + ')"><span>' + esc(it.t) + '</span><div class="track"><div class="fill" style="width:' + Math.min(100, n / 30 * 100) + '%"></div></div><span class="v">' + n + "일</span></div>";
      }).join("") + "</div>";
    });
    // 전공: 과목별 네 단계 끝낸 날
    var sr = cfg().routines.filter(function (r) { return r.kind === "steps" && r.when && r.when.type === "major"; })[0];
    if (sr) {
      var bySub = {};
      for (var i3 = 0; i3 < 30; i3++) {
        var dk3 = C.addDays(today, -i3); if (dk3 < cfg().start) break;
        C.dueFor(cfg(), CAL, ST.log, dk3).forEach(function (D) {
          if (D.r !== sr) return;
          var st = C.status(D, ST.log, dk3);
          D.groups.forEach(function (g, gi) { var b = bySub[g.id] = bySub[g.id] || [0, 0, g.title]; b[1]++; if (st.groups[gi].done >= st.groups[gi].total) b[0]++; });
        });
      }
      var ks = Object.keys(bySub);
      if (ks.length) h += "<h3>" + esc(sr.title) + " — 과목별 (네 단계 모두 끝낸 날 / 수업 날)</h3><div class='bars'>" + ks.map(function (k) {
        var b = bySub[k];
        return '<div class="bar" style="--tone:var(--school)"><span>' + esc(C.shortSubj(b[2] || k)) + '</span><div class="track"><div class="fill" style="width:' + Math.round(b[0] / b[1] * 100) + '%"></div></div><span class="v">' + b[0] + "/" + b[1] + "</span></div>";
      }).join("") + "</div>";
    }
    h += "</div>";
    main.innerHTML = h;
    main.onclick = null;
  }

  // ---------- 설정 ----------
  var WDSEL = [1, 2, 3, 4, 5, 6, 0];
  function viewSettings() {
    setTop("설정", null, "settings");
    var c = cfg(), h = "";
    h += '<div class="sec-t">알림</div><div class="card list" style="padding:4px 16px"><a class="li" href="#/notify"><div class="grow"><div class="t">매일 알림</div><div class="h">' +
      (c.notify.on ? c.notify.slots.map(function (s) { return s.t + " " + (s.mode === "plan" ? "오늘 할 것" : "남은 것"); }).join(" · ") : "꺼짐") + "</div></div>" + ICON.chev + "</a></div>";
    h += '<div class="sec-t">시간표</div><div class="card list" style="padding:4px 16px"><a class="li" href="#/subjects"><div class="grow"><div class="t">전공 과목과 요일</div><div class="h">' +
      c.subjects.filter(function (s) { return s.study; }).map(function (s) { return C.shortSubj(s.name) + " " + s.days.map(function (d) { return C.WD[d]; }).join(""); }).join(" · ") + "</div></div>" + ICON.chev + "</a></div>";
    h += '<div class="sec-t">루틴</div>';
    c.cats.forEach(function (cat) {
      var rs = c.routines.filter(function (r) { return r.cat === cat.id; });
      h += '<div class="card" style="padding:10px 16px"><div class="rt-h" style="margin:0"><h3>' + esc(cat.name) + '</h3><button class="chipbtn act" data-act="catEdit" data-id="' + esc(cat.id) + '">이름</button></div><div class="list">';
      rs.forEach(function (r) {
        var i = c.routines.indexOf(r);
        h += '<div class="li"><div class="grow"><a href="#/edit/' + esc(r.id) + '" style="text-decoration:none"><div class="t">' + esc(r.title) + (r.off ? ' <span class="small muted">(쉬는 중)</span>' : "") + '</div><div class="h">' + esc(kindName(r.kind)) + " · " + esc(whenName(r)) + "</div></a></div>" +
          '<button class="chipbtn" data-act="up" data-i="' + i + '" aria-label="위로">' + ICON.up.replace("<svg", '<svg width="14" height="14"') + '</button><a class="chipbtn" href="#/edit/' + esc(r.id) + '">고치기</a></div>';
      });
      if (!rs.length) h += '<div class="li muted small">루틴이 없습니다.</div>';
      h += '</div><div class="btns" style="margin-top:6px"><a class="btn ghost sm" href="#/edit/new?cat=' + esc(cat.id) + '">' + ICON.plus.replace("<svg", '<svg width="14" height="14"') + "루틴 추가</a>" + (!rs.length ? '<button class="btn danger sm" data-act="catDel" data-id="' + esc(cat.id) + '">분류 지우기</button>' : "") + "</div></div>";
    });
    h += '<div class="btns" style="margin-top:-4px"><button class="btn ghost sm" data-act="catAdd">분류 추가</button></div>';
    h += '<div class="sec-t">바로 가기 주소</div><div class="card">' +
      '<div class="field"><label>KU MedQ</label><input type="url" id="lkMedq" value="' + esc(c.links.medq && c.links.medq.url || "") + '"></div>' +
      '<div class="field"><label>외국어 공부</label><input type="url" id="lkLang" value="' + esc(c.links.lang && c.links.lang.url || "") + '"></div>' +
      '<div class="btns"><button class="btn sm" data-act="links">주소 저장</button></div></div>';
    h += '<div class="sec-t">기록</div><div class="card"><p class="small muted" style="margin-top:0">' + (STORE ? "기록과 설정은 서버에 저장되어 어느 기기에서 열어도 같습니다." : "이 판은 기록을 이 브라우저에만 저장합니다.") + " 시작한 날: " + esc(c.start) + '</p><div class="btns"><button class="btn ghost sm" data-act="export">백업 받기</button><label class="btn ghost sm" style="cursor:pointer">백업 합치기<input type="file" accept="application/json" id="impFile" hidden></label><button class="btn danger sm" data-act="reset">설정을 처음대로</button></div></div>';
    h += '<div class="sec-t">화면</div><div class="card"><div class="seg" id="themeSeg">' + [["", "기기 설정"], ["light", "밝게"], ["dark", "어둡게"]].map(function (t) {
      return '<label><input type="radio" name="th" value="' + t[0] + '"' + ((lsGet("rt_theme") || "") === t[0] ? " checked" : "") + ">" + t[1] + "</label>";
    }).join("") + "</div>" + (window.RT_LOCK ? '<div class="btns"><button class="btn ghost sm" data-act="lock">이 기기에서 잠그기</button></div>' : "") + "</div>";
    h += '<p class="credit">3D 인체 모형: <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a> (CC BY-SA 4.0), 원본 BodyParts3D © The Database Center for Life Science (CC BY-SA 2.1 JP). 이 사이트는 근육·뼈만 골라 다각형 수를 줄인 파생 모형(model/body.bin, 같은 CC BY-SA 4.0)을 씁니다. 3D 화면은 three.js (MIT).</p>';
    main.innerHTML = h;
    main.onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var a = b.dataset.act;
      if (a === "up") { var i = +b.dataset.i; if (i > 0) { var t = c.routines[i - 1]; c.routines[i - 1] = c.routines[i]; c.routines[i] = t; saveCfg(); rerender(); } }
      else if (a === "catEdit") { var cat = catOf(b.dataset.id), nm = prompt("분류 이름", cat.name); if (nm && nm.trim()) { cat.name = nm.trim(); saveCfg(); rerender(); } }
      else if (a === "catAdd") { var nm2 = prompt("새 분류 이름"); if (nm2 && nm2.trim()) { c.cats.push({ id: uid("c"), name: nm2.trim(), tone: "etc" }); saveCfg(); rerender(); } }
      else if (a === "catDel") { if (confirm("이 분류를 지울까요?")) { c.cats = c.cats.filter(function (x) { return x.id !== b.dataset.id; }); saveCfg(); rerender(); } }
      else if (a === "links") {
        c.links.medq = { name: "KU MedQ", url: document.getElementById("lkMedq").value.trim() };
        c.links.lang = { name: "외국어 공부", url: document.getElementById("lkLang").value.trim() };
        saveCfg(); toast("저장했습니다.");
      } else if (a === "export") {
        var blob = new Blob([JSON.stringify(ST, null, 1)], { type: "application/json" });
        var u = URL.createObjectURL(blob), aa = document.createElement("a"); aa.href = u; aa.download = "routine-backup-" + C.dkey() + ".json"; document.body.appendChild(aa); aa.click(); aa.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
      } else if (a === "reset") {
        if (!confirm("루틴·과목·알림 설정을 처음 것으로 되돌릴까요? 체크 기록은 그대로 둡니다.")) return;
        var start = c.start, custom = c.customEx; ST.cfg = clone(DEF); ST.cfg.start = start; ST.cfg.customEx = custom || {}; saveCfg(); rerender();
      } else if (a === "lock") { if (confirm("이 기기에 기억한 비밀번호를 지웁니다.")) window.RT_LOCK(); }
    };
    document.getElementById("impFile").onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var j = JSON.parse(t); if (!j || !j.log) throw new Error("형식");
        ST = C.mergeState(ST, j); touch(C.dkey()); toast("합쳤습니다."); rerender();
      }).catch(function () { toast("백업 파일을 읽지 못했습니다."); });
    };
    document.querySelectorAll("#themeSeg input").forEach(function (x) { x.onchange = function () { lsSet("rt_theme", x.value); applyTheme(); }; });
  }
  function kindName(k) { return { check: "체크 하나", list: "모두 하기", steps: "순서대로", any: "N개 중 하나 이상", workout: "운동" }[k] || k; }
  function whenName(r) {
    var w = r.when || { type: "daily" };
    if (w.type === "major") return "전공 수업 있는 날" + (r.perSubject === false ? "" : " · 과목마다");
    if (w.type === "days") return (w.days || []).slice().sort(function (a, b) { return (a || 7) - (b || 7); }).map(function (d) { return C.WD[d]; }).join("·") + "요일";
    return "매일";
  }
  function applyTheme() { var t = lsGet("rt_theme"); if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
  applyTheme();

  function viewSubjects() {
    setTop("시간표", "#/settings", "settings");
    EDITING = true;
    var c = cfg(), draft = clone(c.subjects);
    function draw() {
      var h = '<p class="lead">전공 수업이 있는 요일을 정합니다. ‘학교 공부’ 루틴은 이 표(또는 iCloud 시간표)에서 그날 수업이 있는 과목마다 나옵니다. 끈 과목은 수업이 있어도 루틴을 만들지 않습니다.</p>';
      if (CAL && CAL.from) h += '<div class="card"><b>iCloud 시간표 반영 중</b><p class="small muted" style="margin:4px 0 0">' + esc(CAL.from) + " ~ " + esc(C.addDays(CAL.to, -1)) + "는 iCloud 캘린더의 실제 수업 일정을 씁니다(휴강·시험 주간 반영). 그 밖의 날은 아래 요일표를 씁니다. 마지막으로 맞춘 때: " + esc(CAL.gen ? new Date(CAL.gen).toLocaleString("ko-KR") : "-") + "</p></div>";
      draft.forEach(function (s, i) {
        h += '<div class="card"><div class="field" style="margin-top:0"><label>과목 이름</label><input type="text" data-i="' + i + '" data-f="name" value="' + esc(s.name) + '"></div>' +
          '<div class="field"><span class="lab">수업 요일</span><div class="seg">' + WDSEL.map(function (d) { return '<label><input type="checkbox" data-i="' + i + '" data-f="day" value="' + d + '"' + (s.days.indexOf(d) >= 0 ? " checked" : "") + ">" + C.WD[d] + "</label>"; }).join("") + "</div></div>" +
          '<div class="switch"><span>공부 루틴 만들기</span><input type="checkbox" data-i="' + i + '" data-f="study"' + (s.study ? " checked" : "") + "></div>" +
          '<div class="field"><label>iCloud 일정 제목 (쉼표로 여러 개, 앞부분이 같으면 맞음)</label><input type="text" data-i="' + i + '" data-f="match" value="' + esc((s.match || []).join(", ")) + '"></div>' +
          '<div class="btns"><button class="btn danger sm" data-act="del" data-i="' + i + '">과목 지우기</button></div></div>';
      });
      h += '<div class="btns"><button class="btn ghost" data-act="add">과목 추가</button><button class="btn" data-act="save">저장</button></div>';
      main.innerHTML = h;
    }
    draw();
    main.oninput = main.onchange = function (e) {
      var x = e.target, i = +x.dataset.i, f = x.dataset.f; if (!f || isNaN(i)) return;
      var s = draft[i];
      if (f === "name") s.name = x.value;
      else if (f === "study") s.study = x.checked;
      else if (f === "match") s.match = x.value.split(",").map(function (y) { return y.trim(); }).filter(Boolean);
      else if (f === "day") { var d = +x.value; s.days = s.days.filter(function (y) { return y !== d; }); if (x.checked) s.days.push(d); }
    };
    main.onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "add") { draft.push({ id: uid("s"), name: "새 과목", days: [], study: true, match: [] }); draw(); }
      else if (b.dataset.act === "del") { if (confirm("이 과목을 지울까요?")) { draft.splice(+b.dataset.i, 1); draw(); } }
      else if (b.dataset.act === "save") {
        if (draft.some(function (s) { return !s.name.trim(); })) { toast("과목 이름을 채워 주십시오."); return; }
        c.subjects = draft; saveCfg(); EDITING = false; toast("저장했습니다."); location.hash = "#/settings";
      }
    };
  }

  // ---------- 알림 ----------
  var SWREG = ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) ? navigator.serviceWorker.register("sw.js").catch(function () { return null; }) : null;
  var STANDALONE = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function b64uBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function pushSave(sub, remove, tries) {
    if (!STORE) return Promise.reject(new Error("서버 없음"));
    var j = sub.toJSON ? sub.toJSON() : sub;
    tries = tries || 0;
    return readRow(P.push).then(function (row) {
      var d = (row && row.data) || {}, list = d.subs || [];
      var had = list.some(function (x) { return x.endpoint === j.endpoint; });
      if (remove ? !had : had) return;
      list = list.filter(function (x) { return x.endpoint !== j.endpoint; });
      if (!remove) list.push({ endpoint: j.endpoint, keys: j.keys, ua: navigator.userAgent.slice(0, 140), t: Date.now() });
      d.subs = list;
      return writeRow(P.push, d, row ? row.ver : null).then(function (v) { if (v == null) { if (tries < 3) return pushSave(sub, remove, tries + 1); throw new Error("충돌"); } });
    });
  }
  function viewNotify() {
    setTop("매일 알림", "#/settings", "settings");
    EDITING = true;
    var n = clone(cfg().notify);
    function draw() {
      var h = '<div class="card" id="pushCard"><h2>이 기기</h2><p class="muted small" id="pushMsg">확인하는 중…</p><div class="btns" id="pushBtns"></div></div>';
      h += '<div class="card"><h2>보낼 시각</h2><p class="small muted" style="margin-top:0">‘오늘 할 것’은 그날 루틴 목록을, ‘남은 것’은 아직 체크하지 않은 것만 보냅니다(다 했으면 보내지 않습니다). 보내는 쪽(GitHub)의 예약이 늦어서 보통 정한 시각보다 몇 분~30분 늦게 옵니다.</p>' +
        '<div class="switch"><span>알림 보내기</span><input type="checkbox" id="nOn"' + (n.on ? " checked" : "") + "></div>";
      n.slots.forEach(function (s, i) {
        h += '<div class="ed-item"><div class="grid2"><input type="time" data-i="' + i + '" data-f="t" value="' + esc(s.t) + '"><select data-i="' + i + '" data-f="mode"><option value="plan"' + (s.mode === "plan" ? " selected" : "") + '>오늘 할 것</option><option value="left"' + (s.mode === "left" ? " selected" : "") + '>남은 것</option></select></div>' +
          '<div class="tools"><button type="button" data-act="del" data-i="' + i + '" aria-label="지우기">' + ICON.x.replace("<svg", '<svg width="14" height="14"') + "</button></div></div>";
      });
      h += '<div class="btns"><button class="btn ghost sm" data-act="add">시각 추가</button><button class="btn sm" data-act="save">저장</button></div></div>';
      h += '<div class="card"><h2>미리 보기</h2><p class="small" style="margin:0"><b>오늘의 루틴</b><br>' + esc(C.planText(cfg(), CAL, ST.log, C.dkey(), LIB)) + '</p><p class="small" style="margin:10px 0 0"><b>남은 루틴이 있습니다</b><br>' + esc(C.leftText(cfg(), CAL, ST.log, C.dkey(), LIB) || "(지금은 남은 것이 없어 보내지 않습니다)") + "</p></div>";
      main.innerHTML = h;
      pushUI();
    }
    draw();
    main.onchange = main.oninput = function (e) {
      var x = e.target;
      if (x.id === "nOn") { n.on = x.checked; return; }
      var i = +x.dataset.i; if (isNaN(i) || !n.slots[i]) return;
      n.slots[i][x.dataset.f] = x.value;
    };
    main.onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "add") { n.slots.push({ id: uid("n"), t: "12:00", mode: "left" }); draw(); }
      else if (b.dataset.act === "del") { n.slots.splice(+b.dataset.i, 1); draw(); }
      else if (b.dataset.act === "save") {
        n.slots = n.slots.filter(function (s) { return C.hm(s.t) != null; }).sort(function (a, b2) { return C.hm(a.t) - C.hm(b2.t); });
        cfg().notify = n; saveCfg(); toast("저장했습니다."); draw();
      }
    };
  }
  function pushUI() {
    var msg = document.getElementById("pushMsg"), bt = document.getElementById("pushBtns"); if (!msg) return;
    function put(m, b) { msg.textContent = m; bt.innerHTML = b || ""; }
    if (!STORE) { put("로컬판에서는 알림을 켤 수 없습니다. 공개 사이트에서 켜 주십시오."); return; }
    if (!SWREG || !("PushManager" in window) || !("Notification" in window)) {
      put(IOS && !STANDALONE ? "iPhone은 Safari 공유 단추 → ‘홈 화면에 추가’로 앱을 만든 뒤, 그 앱에서 켤 수 있습니다." : "이 브라우저에서는 알림을 쓸 수 없습니다.");
      return;
    }
    SWREG.then(function (reg) {
      if (!reg) { put("알림을 준비하지 못했습니다."); return; }
      return reg.pushManager.getSubscription().then(function (sub) {
        if (Notification.permission === "denied") { put("알림이 막혀 있습니다. 기기 설정 → 알림에서 이 앱을 허용해 주십시오."); return; }
        if (sub && Notification.permission === "granted") {
          put("이 기기로 알림이 옵니다.", '<button class="btn ghost sm" id="pTest">알림 모양 보기</button><button class="btn danger sm" id="pOff">이 기기 알림 끄기</button>');
          pushSave(sub).catch(function () { msg.textContent = "켜져 있지만 서버에 등록하지 못했습니다. 연결되면 이 화면을 다시 열어 주십시오."; });
          document.getElementById("pOff").onclick = function () { pushSave(sub, true).catch(function () {}).then(function () { return sub.unsubscribe(); }).then(pushUI, pushUI); };
          document.getElementById("pTest").onclick = function () {
            reg.showNotification("오늘의 루틴", { body: C.planText(cfg(), CAL, ST.log, C.dkey(), LIB), icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "test" });
          };
        } else {
          put("아직 이 기기로는 알림이 오지 않습니다.", '<button class="btn sm" id="pOn">이 기기에서 알림 받기</button>');
          document.getElementById("pOn").onclick = function () {
            Notification.requestPermission().then(function (p) {
              if (p !== "granted") return pushUI();
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(STORE.pushKey) }).then(function (s) { return pushSave(s); }).then(pushUI);
            }).catch(function (e) { put("켜지 못했습니다: " + (e && e.message || e)); });
          };
        }
      });
    });
  }

  // ---------- 루틴 고치기 ----------
  function viewEdit(rid) {
    var qs = new URLSearchParams((location.hash.split("?")[1]) || "");
    var isNew = rid === "new", src = isNew ? null : routineById(rid);
    if (!isNew && !src) { location.hash = "#/settings"; return; }
    EDITING = true;
    var d = src ? clone(src) : { id: uid("r"), cat: qs.get("cat") || (cfg().cats[0] && cfg().cats[0].id), kind: qs.get("kind") || "check", title: "", when: { type: "daily" }, items: [{ id: uid("i"), t: "" }], min: 1 };
    if (d.kind === "workout" && !d.sessions) { d.week = { 0: "rest", 1: "rest", 2: "rest", 3: "rest", 4: "rest", 5: "rest", 6: "rest" }; d.sessions = { rest: { name: "쉬는 날", items: [] } }; }
    setTop(isNew ? "루틴 추가" : "루틴 고치기", "#/settings", "settings");
    var exIds = Object.keys(viewLib().exercises);
    // 링크 고르기. pre = "items.3." (항목) 또는 "" (루틴 이름 옆 단추)
    function linkSel(pre, v) {
      var opts = [["", "링크 없음"], ["medq", "KU MedQ"], ["lang", "외국어 공부"]];
      if (v && /^lang:/.test(v)) opts.push([v, "외국어 공부(" + v.slice(5) + ")"]);
      var custom = v && /^https?:/.test(v);
      return '<select data-f="' + pre + 'link">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + ((v || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '<option value="url"' + (custom ? " selected" : "") + ">직접 주소</option></select>" +
        (custom ? '<input type="url" data-f="' + pre + 'url" value="' + esc(v) + '" placeholder="https://">' : "");
    }
    function draw() {
      var h = '<div class="card">';
      h += '<div class="field" style="margin-top:0"><label>이름</label><input type="text" data-f="title" value="' + esc(d.title) + '" placeholder="예: 물 2L 마시기"></div>';
      h += '<div class="field"><label>분류</label><select data-f="cat">' + cfg().cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (d.cat === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></div>";
      if (d.kind !== "workout") {
        h += '<div class="field"><span class="lab">종류</span><div class="seg">' + [["check", "체크 하나"], ["list", "모두 하기"], ["steps", "순서대로"], ["any", "N개 중 하나 이상"]].map(function (k) {
          return '<label><input type="radio" name="kind" data-f="kind" value="' + k[0] + '"' + (d.kind === k[0] ? " checked" : "") + ">" + k[1] + "</label>";
        }).join("") + "</div></div>";
      }
      if (d.kind !== "workout") {
        var w = d.when || { type: "daily" };
        h += '<div class="field"><span class="lab">언제</span><div class="seg">' + [["daily", "매일"], ["days", "요일 고르기"], ["major", "전공 수업 있는 날"]].map(function (k) {
          return '<label><input type="radio" name="when" data-f="when.type" value="' + k[0] + '"' + (w.type === k[0] ? " checked" : "") + ">" + k[1] + "</label>";
        }).join("") + "</div>";
        if (w.type === "days") h += '<div class="seg" style="margin-top:8px">' + WDSEL.map(function (dd) { return '<label><input type="checkbox" data-f="when.day" value="' + dd + '"' + ((w.days || []).indexOf(dd) >= 0 ? " checked" : "") + ">" + C.WD[dd] + "</label>"; }).join("") + "</div>";
        if (w.type === "major") h += '<div class="switch" style="border:0"><span>과목마다 따로 하기</span><input type="checkbox" data-f="perSubject"' + (d.perSubject !== false ? " checked" : "") + "></div>";
        h += "</div>";
        if (d.kind === "any") h += '<div class="field"><label>몇 개 이상 하면 끝?</label><input type="number" min="1" data-f="min" value="' + (d.min || 1) + '"></div>';
        h += '<div class="field"><label>설명 (선택)</label><input type="text" data-f="note" value="' + esc(d.note || "") + '"></div>';
        h += '<div class="field"><label>루틴 링크 (이름 옆 단추 하나)</label>' + linkSel("", d.link) + "</div>";
        h += '<div class="field"><span class="lab">' + (d.kind === "steps" ? "단계 (위에서부터 순서대로)" : "항목") + "</span>";
        (d.items || []).forEach(function (it, i) {
          h += '<div class="ed-item"><div><input type="text" data-f="items.' + i + '.t" value="' + esc(it.t) + '" placeholder="할 일">' +
            '<div class="grid2" style="margin-top:6px"><input type="text" data-f="items.' + i + '.hint" value="' + esc(it.hint || "") + '" placeholder="작은 설명(선택)"><div>' + linkSel("items." + i + ".", it.link) + "</div></div></div>" +
            '<div class="tools"><button type="button" data-act="iup" data-i="' + i + '">' + ICON.up.replace("<svg", '<svg width="14" height="14"') + '</button><button type="button" data-act="idel" data-i="' + i + '">' + ICON.x.replace("<svg", '<svg width="14" height="14"') + "</button></div></div>";
        });
        h += '<button class="btn ghost sm" data-act="iadd">항목 추가</button></div>';
      } else {
        h += '<div class="field"><span class="lab">요일별 세션</span>' + WDSEL.map(function (dd) {
          return '<div class="switch"><span>' + C.WD[dd] + '요일</span><select style="width:auto" data-f="week.' + dd + '">' + Object.keys(d.sessions).map(function (sid) { return '<option value="' + esc(sid) + '"' + (d.week[dd] === sid ? " selected" : "") + ">" + esc(d.sessions[sid].name) + "</option>"; }).join("") + "</select></div>";
        }).join("") + "</div>";
        Object.keys(d.sessions).forEach(function (sid) {
          var s = d.sessions[sid];
          h += '<div class="card" style="background:var(--card2)"><div class="field" style="margin-top:0"><label>세션 이름</label><input type="text" data-f="sessions.' + sid + '.name" value="' + esc(s.name) + '"></div>' +
            '<div class="switch"><span>이 중 몇 개만 해도 끝 (0 = 모두)</span><input type="number" style="width:80px" min="0" data-f="sessions.' + sid + '.any" value="' + (s.any || 0) + '"></div>';
          (s.items || []).forEach(function (it, i) {
            h += '<div class="ed-item"><div><select data-f="sessions.' + sid + ".items." + i + '.ex">' + exIds.map(function (x) { var e = exOf(x); return '<option value="' + esc(x) + '"' + (it.ex === x ? " selected" : "") + ">" + esc(e.name) + (e.en ? " · " + esc(e.en) : "") + "</option>"; }).join("") + "</select>" +
              '<div class="grid2" style="margin-top:6px"><input type="number" min="1" max="10" data-f="sessions.' + sid + ".items." + i + '.sets" value="' + (it.sets || 1) + '" title="세트"><input type="text" data-f="sessions.' + sid + ".items." + i + '.reps" value="' + esc(it.reps || "") + '" placeholder="횟수·시간"></div></div>' +
              '<div class="tools"><button type="button" data-act="eup" data-s="' + esc(sid) + '" data-i="' + i + '">' + ICON.up.replace("<svg", '<svg width="14" height="14"') + '</button><button type="button" data-act="edel" data-s="' + esc(sid) + '" data-i="' + i + '">' + ICON.x.replace("<svg", '<svg width="14" height="14"') + "</button></div></div>";
          });
          h += '<div class="btns"><button class="btn ghost sm" data-act="eadd" data-s="' + esc(sid) + '">운동 추가</button>' + (sid !== "rest" ? '<button class="btn danger sm" data-act="sdel" data-s="' + esc(sid) + '">세션 지우기</button>' : "") + "</div></div>";
        });
        h += '<div class="btns"><button class="btn ghost sm" data-act="sadd">세션 추가</button><button class="btn ghost sm" data-act="newex">새 운동 만들기</button></div>';
      }
      h += '<div class="switch" style="margin-top:10px"><span>잠시 쉬기 (오늘 화면에서 숨김)</span><input type="checkbox" data-f="off"' + (d.off ? " checked" : "") + "></div>";
      h += '<div class="btns"><button class="btn" data-act="save">저장</button><a class="btn ghost" href="#/settings">취소</a>' + (!isNew ? '<button class="btn danger" data-act="delete">지우기</button>' : "") + "</div></div>";
      main.innerHTML = h;
    }
    function setPath(path, val) {
      var ks = path.split("."), o = d;
      for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = val;
    }
    draw();
    main.oninput = main.onchange = function (e) {
      var x = e.target, f = x.dataset.f; if (!f) return;
      if (f === "kind") { d.kind = x.value; if (!d.items || !d.items.length) d.items = [{ id: uid("i"), t: "" }]; draw(); return; }
      if (f === "when.type") { d.when = { type: x.value, days: (d.when && d.when.days) || [] }; draw(); return; }
      if (f === "when.day") { var dd = +x.value; d.when.days = (d.when.days || []).filter(function (y) { return y !== dd; }); if (x.checked) d.when.days.push(dd); return; }
      if (f === "perSubject" || f === "off") { d[f] = x.checked; return; }
      if (/(^|\.)link$/.test(f)) { if (x.value === "url") { setPath(f, "https://"); draw(); } else setPath(f, x.value || undefined); return; }
      if (/(^|\.)url$/.test(f)) { setPath(f.replace(/url$/, "link"), x.value); return; }
      if (/\.(sets|any)$/.test(f) || f === "min") { setPath(f, Math.max(0, parseInt(x.value, 10) || 0)); return; }
      setPath(f, x.value);
    };
    main.onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var a = b.dataset.act, i = +b.dataset.i, sid = b.dataset.s;
      if (a === "iadd") { d.items.push({ id: uid("i"), t: "" }); draw(); }
      else if (a === "idel") { d.items.splice(i, 1); draw(); }
      else if (a === "iup" && i > 0) { var t = d.items[i - 1]; d.items[i - 1] = d.items[i]; d.items[i] = t; draw(); }
      else if (a === "eadd") { d.sessions[sid].items.push({ ex: exIds[0], sets: 3, reps: "10회" }); draw(); }
      else if (a === "edel") { d.sessions[sid].items.splice(i, 1); draw(); }
      else if (a === "eup" && i > 0) { var its = d.sessions[sid].items, t2 = its[i - 1]; its[i - 1] = its[i]; its[i] = t2; draw(); }
      else if (a === "sadd") { var nid = uid("S"); d.sessions[nid] = { name: "새 세션", items: [] }; draw(); }
      else if (a === "sdel") {
        if (!confirm("이 세션을 지울까요? 이 세션을 쓰던 요일은 쉬는 날이 됩니다.")) return;
        delete d.sessions[sid]; if (!d.sessions.rest) d.sessions.rest = { name: "쉬는 날", items: [] };
        Object.keys(d.week).forEach(function (k) { if (d.week[k] === sid) d.week[k] = "rest"; }); draw();
      } else if (a === "newex") newExSheet(function (id) { exIds = Object.keys(viewLib().exercises); toast("‘" + exOf(id).name + "’을(를) 만들었습니다. 세션의 운동 목록에서 고를 수 있습니다."); draw(); });
      else if (a === "delete") {
        if (!confirm("‘" + (src.title || "") + "’ 루틴을 지울까요? 지난 체크 기록은 남습니다.")) return;
        cfg().routines = cfg().routines.filter(function (r) { return r.id !== src.id; }); saveCfg(); EDITING = false; location.hash = "#/settings";
      } else if (a === "save") {
        if (!d.title.trim()) { toast("이름을 채워 주십시오."); return; }
        if (d.kind !== "workout") {
          d.items = (d.items || []).filter(function (it) { return it.t && it.t.trim(); });
          if (!d.items.length) { toast("항목을 하나 이상 넣어 주십시오."); return; }
          d.items.forEach(function (it) { it.id = it.id || uid("i"); if (it.link === "https://") delete it.link; });
          if (d.when.type === "days" && !(d.when.days || []).length) { toast("요일을 골라 주십시오."); return; }
          if (d.kind !== "any") delete d.min;
        }
        if (isNew) cfg().routines.push(d);
        else cfg().routines = cfg().routines.map(function (r) { return r.id === src.id ? d : r; });
        saveCfg(); EDITING = false; toast("저장했습니다."); location.hash = "#/settings";
      }
    };
  }
  function newExSheet(done) {
    var mus = Object.keys(LIB.muscles);
    var pick = function (name) { return '<div class="seg" style="max-height:180px;overflow:auto">' + mus.map(function (id) { return '<label class="en"><input type="checkbox" name="' + name + '" value="' + id + '">' + esc(LIB.muscles[id].en) + "</label>"; }).join("") + "</div>"; };
    sheet("<h2>새 운동 만들기</h2>" +
      '<div class="field"><label>이름</label><input type="text" id="nxName" placeholder="예: 철봉 매달리기"></div>' +
      '<div class="field"><label>영어 이름 (선택)</label><input type="text" id="nxEn" placeholder="e.g. Dead hang"></div>' +
      '<div class="field"><span class="lab">주로 쓰는 근육</span>' + pick("nxP") + "</div>" +
      '<div class="field"><span class="lab">함께 쓰는 근육</span>' + pick("nxS") + "</div>" +
      '<div class="field"><label>하는 법 (한 줄에 하나)</label><textarea id="nxHow"></textarea></div>' +
      '<div class="field"><label>효과 (선택)</label><textarea id="nxEff"></textarea></div>' +
      '<div class="btns"><button class="btn" id="nxSave">만들기</button><button class="btn ghost" id="nxCancel">취소</button></div>', function (el) {
      el.querySelector("#nxCancel").onclick = closeSheet;
      el.querySelector("#nxSave").onclick = function () {
        var nm = el.querySelector("#nxName").value.trim(); if (!nm) { toast("이름을 넣어 주십시오."); return; }
        var get = function (n) { return [].slice.call(el.querySelectorAll('input[name="' + n + '"]:checked')).map(function (x) { return x.value; }); };
        var id = uid("cx");
        cfg().customEx[id] = { name: nm, en: el.querySelector("#nxEn").value.trim(), kind: "strength", rest: 60, primary: get("nxP"), secondary: get("nxS"),
          how: el.querySelector("#nxHow").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean), effect: el.querySelector("#nxEff").value.trim(), custom: true };
        saveCfg(); closeSheet(); done(id);
      };
    });
  }

  // ---------- 시작 ----------
  route();
  if (STORE) syncNow();
  // 날짜가 바뀌면(자정을 넘겨 켜 둔 경우) 오늘 화면을 새로 그린다
  var lastDay = C.dkey();
  setInterval(function () { var d = C.dkey(); if (d !== lastDay) { lastDay = d; if (!EDITING && (!location.hash || location.hash === "#/")) rerender(); } }, 60000);
  // 3D 모형은 잠시 뒤 미리 받아 둔다
  setTimeout(function () { import("./viewer.js").then(function (m) { m.preload(); }).catch(function () {}); }, 2500);
})();
