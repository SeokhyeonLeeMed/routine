// 루틴 판정 공용 코드 — 브라우저(app.js)와 알림 보내기(.github/push.mjs)가 함께 쓴다.
// 날짜는 모두 한국 시각(KST) 기준 'YYYY-MM-DD'.
//
// 상태(state) = { cfg, log, upd }
//   cfg: 설정(data/defaults.js 모양 — 루틴·과목·알림)
//   log[날짜][열쇠] = { n: 한 횟수(체크는 1, 운동은 끝낸 세트 수), t: 바꾼 시각 }
//   log[날짜]._major = { v: [과목 id] 또는 null(되돌림), t }   그날 전공 수업 과목을 손으로 바꾼 것
//   log[날짜]._sum = { due, done, cats: {cat: [done, due]} }   그날 요약(기록 화면이 쓴다, 설정이 바뀌어도 지난날은 그대로)
// 달력(cal) = { from, to, days: { 날짜: [과목 id] } }   iCloud 시간표(_tools/calendar_sync.py)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RT_CORE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var KST = 9 * 3600e3;
  var WD = ["일", "월", "화", "수", "목", "금", "토"];

  function dkey(ts) { return new Date((ts == null ? Date.now() : ts) + KST).toISOString().slice(0, 10); }
  function wday(dk) { return new Date(dk + "T00:00:00Z").getUTCDay(); }
  function addDays(dk, n) { var d = new Date(dk + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function nowMin(ts) { var d = new Date((ts == null ? Date.now() : ts) + KST); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function hm(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; }
  function label(dk) { var p = dk.split("-"); return +p[1] + "월 " + +p[2] + "일 (" + WD[wday(dk)] + ")"; }

  function subjById(cfg, id) { for (var i = 0; i < cfg.subjects.length; i++) if (cfg.subjects[i].id === id) return cfg.subjects[i]; return null; }

  // 그날 전공 수업 과목 id 목록. 손으로 바꾼 것 > iCloud 달력(범위 안) > 요일표
  function majorsOn(cfg, cal, log, dk) {
    var o = log && log[dk] && log[dk]._major;
    var study = function (id) { var s = subjById(cfg, id); return s && s.study; };
    if (o && o.v) return o.v.filter(study);
    if (cal && cal.days && cal.from && dk >= cal.from && dk < cal.to) return (cal.days[dk] || []).filter(study);
    var w = wday(dk);
    return cfg.subjects.filter(function (s) { return s.study && s.days.indexOf(w) >= 0; }).map(function (s) { return s.id; });
  }
  function majorSource(cfg, cal, log, dk) {
    var o = log && log[dk] && log[dk]._major;
    if (o && o.v) return "manual";
    if (cal && cal.days && cal.from && dk >= cal.from && dk < cal.to) return "calendar";
    return "week";
  }

  function whenOk(r, dk) {
    var w = r.when || { type: "daily" };
    if (w.type === "days") return (w.days || []).indexOf(wday(dk)) >= 0;
    return true; // daily, major(과목 판정은 아래에서)
  }

  function sessionOf(r, dk) {
    var sid = r.week ? r.week[wday(dk)] : null;
    if (!sid || !r.sessions || !r.sessions[sid]) return null;
    return { id: sid, s: r.sessions[sid] };
  }

  // 그날 해야 할 루틴 목록. 각 루틴: { r, groups:[{id, title, items:[{key,t,need,hint,link,ex,reps,idx}]}], min, rest, session }
  function dueFor(cfg, cal, log, dk) {
    var out = [];
    (cfg.routines || []).forEach(function (r) {
      if (r.off || !whenOk(r, dk)) return;
      var items = r.items || [];
      var mk = function (gid, it, i) {
        return { key: r.id + "/" + gid + "/" + it.id, id: it.id, t: it.t, need: 1, hint: it.hint, link: it.link, idx: i };
      };
      if (r.kind === "workout") {
        var se = sessionOf(r, dk);
        if (!se) return;
        var seen = {};
        var its = (se.s.items || []).map(function (it, i) {
          var id = it.ex; if (seen[id]) id = it.ex + "_" + i; seen[id] = 1;
          return { key: r.id + "/" + se.id + "/" + id, id: id, ex: it.ex, t: it.t || null, need: Math.max(1, +it.sets || 1), reps: it.reps, idx: i };
        });
        out.push({ r: r, session: se, rest: !its.length, min: se.s.any || 0, groups: [{ id: se.id, title: se.s.name, items: its }] });
        return;
      }
      if (r.when && r.when.type === "major") {
        var subs = majorsOn(cfg, cal, log, dk);
        if (!subs.length) return;
        if (r.perSubject === false) {
          out.push({ r: r, groups: [{ id: "_", title: subs.map(function (id) { return subjById(cfg, id).name; }).join(" · "), items: items.map(function (it, i) { return mk("_", it, i); }) }] });
        } else {
          out.push({ r: r, groups: subs.map(function (id) { return { id: id, title: subjById(cfg, id).name, items: items.map(function (it, i) { return mk(id, it, i); }) }; }) });
        }
        return;
      }
      out.push({ r: r, min: r.kind === "any" ? Math.max(1, +r.min || 1) : 0, groups: [{ id: "_", title: null, items: items.map(function (it, i) { return mk("_", it, i); }) }] });
    });
    return out;
  }

  function nOf(log, dk, key) { var e = log && log[dk] && log[dk][key]; return e ? e.n || 0 : 0; }

  // 루틴 하나의 진행 상황
  function status(D, log, dk) {
    var total = 0, done = 0, next = null, groups = [];
    D.groups.forEach(function (g) {
      var gd = 0, gnext = null;
      g.items.forEach(function (it) {
        var ok = nOf(log, dk, it.key) >= it.need;
        if (ok) gd++; else if (!gnext) gnext = it;
      });
      total += g.items.length; done += gd;
      groups.push({ id: g.id, done: gd, total: g.items.length, next: gnext });
      if (!next && gnext) next = { g: g, it: gnext };
    });
    var complete;
    if (D.rest) complete = true;
    else if (D.min) complete = done >= D.min;
    else complete = total > 0 && done >= total;
    return { total: total, done: done, complete: complete, next: next, groups: groups };
  }

  function summary(cfg, cal, log, dk) {
    var due = dueFor(cfg, cal, log, dk), s = { due: 0, done: 0, cats: {} };
    due.forEach(function (D) {
      if (D.rest) return;
      var st = status(D, log, dk), c = D.r.cat;
      s.cats[c] = s.cats[c] || [0, 0];
      s.cats[c][1]++; s.due++;
      if (st.complete) { s.cats[c][0]++; s.done++; }
    });
    return s;
  }

  // 순서형(steps): 앞 단계가 끝나야 다음 단계를 체크할 수 있다
  function canCheck(D, it, log, dk) {
    if (D.r.kind !== "steps") return true;
    var g = null;
    D.groups.forEach(function (x) { if (x.items.indexOf(it) >= 0) g = x; });
    if (!g) return true;
    for (var i = 0; i < it.idx; i++) if (nOf(log, dk, g.items[i].key) < g.items[i].need) return false;
    return true;
  }

  // 기록 합치기: 칸마다 늦게 바꾼 쪽, 설정은 upd가 늦은 쪽
  function mergeLog(a, b) {
    var out = {}, k;
    [a || {}, b || {}].forEach(function (L) {
      for (var dk in L) {
        out[dk] = out[dk] || {};
        for (k in L[dk]) {
          var x = L[dk][k], y = out[dk][k];
          if (k === "_sum") { if (!y || (x && x.t || 0) >= (y.t || 0)) out[dk][k] = x; continue; }
          if (!y || (x && x.t || 0) > (y.t || 0)) out[dk][k] = x;
        }
      }
    });
    return out;
  }
  function mergeState(a, b) {
    if (!a) return b; if (!b) return a;
    var cfg = (a.cfg && b.cfg) ? ((a.cfg.upd || 0) >= (b.cfg.upd || 0) ? a.cfg : b.cfg) : (a.cfg || b.cfg);
    return { cfg: cfg, log: mergeLog(a.log, b.log), upd: Math.max(a.upd || 0, b.upd || 0) };
  }

  function exName(lib, it) {
    if (it.t) return it.t;
    var e = lib && lib.exercises && lib.exercises[it.ex];
    return e ? e.name : it.ex;
  }

  // 알림 문구
  function shortSubj(name) { return name.replace(/사회적 뇌와 인간 행동/, "사뇌인").replace(/의과학연구기초III?/, "의과연"); }
  function planText(cfg, cal, log, dk, lib) {
    var parts = [];
    dueFor(cfg, cal, log, dk).forEach(function (D) {
      if (D.rest) return;
      if (D.r.kind === "steps" || (D.r.when && D.r.when.type === "major")) parts.push(D.r.title + ": " + D.groups.map(function (g) { return shortSubj(g.title || ""); }).join("·"));
      else if (D.r.kind === "workout") parts.push(D.r.title + " " + D.session.s.name + (D.min ? "(" + D.min + "개 이상)" : ""));
      else if (D.r.kind === "any") parts.push(D.r.title + " " + D.min + "개 이상");
      else parts.push(D.r.title);
    });
    return parts.length ? parts.join(" · ") : "오늘은 정해진 루틴이 없습니다.";
  }
  function leftText(cfg, cal, log, dk, lib) {
    var parts = [];
    dueFor(cfg, cal, log, dk).forEach(function (D) {
      if (D.rest) return;
      var st = status(D, log, dk);
      if (st.complete) return;
      if (D.r.kind === "steps") {
        D.groups.forEach(function (g, i) {
          var gs = st.groups[i];
          if (gs.next) parts.push(shortSubj(g.title || D.r.title) + " " + gs.next.t + (gs.done ? "부터" : ""));
        });
      } else if (D.r.kind === "workout") {
        parts.push(D.r.title + (D.min ? " (" + D.session.s.name + ")" : " " + st.done + "/" + st.total));
      } else if (D.r.kind === "any") {
        parts.push(D.r.title + " 아직");
      } else {
        parts.push(D.r.title + (st.total > 1 ? " " + st.done + "/" + st.total : ""));
      }
    });
    return parts.join(" · ");
  }

  // 알림 시각 판정: 정한 시각부터 150분 안, 그날 그 칸을 아직 안 보냈으면 보낸다
  function dueSlots(cfg, sent, ts) {
    var dk = dkey(ts), m = nowMin(ts), out = [];
    if (!cfg || !cfg.notify || !cfg.notify.on) return out;
    (cfg.notify.slots || []).forEach(function (s) {
      var t = hm(s.t);
      if (t == null) return;
      if (m >= t && m < t + 150 && !(sent && sent[dk] && sent[dk][s.id])) out.push(s);
    });
    return out;
  }

  return {
    WD: WD, dkey: dkey, wday: wday, addDays: addDays, nowMin: nowMin, hm: hm, label: label,
    subjById: subjById, majorsOn: majorsOn, majorSource: majorSource, sessionOf: sessionOf,
    dueFor: dueFor, status: status, summary: summary, nOf: nOf, canCheck: canCheck,
    mergeLog: mergeLog, mergeState: mergeState, exName: exName,
    planText: planText, leftText: leftText, dueSlots: dueSlots, shortSubj: shortSubj
  };
});
