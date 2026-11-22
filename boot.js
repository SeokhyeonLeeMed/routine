// 공개판 시작: 비밀번호(general_assistant와 같은 것) → 열쇠(PBKDF2) → d.bin 풀기 → core.js·app.js 실행
// d.bin 안: 근육·운동 사전(RT_LIB), 처음 설정(RT_DEFAULTS), 서버 저장 계정(RT_STORE)
(function () {
  "use strict";
  var KEYSTORE = "rt_key";
  var app = document.getElementById("app");
  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function getBin(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.arrayBuffer(); }); }
  function derive(pw, meta) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(meta.salt), iterations: meta.iter, hash: "SHA-256" }, k, 256);
    });
  }
  function decrypt(raw, buf) {
    var a = new Uint8Array(buf);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: a.slice(0, 12) }, key, a.slice(12));
    });
  }
  function gunzip(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src)); }; document.body.appendChild(s); }); }
  var meta;
  function open(raw, remember) {
    return getBin("d.bin?v=" + meta.v).then(function (buf) { return decrypt(raw, buf); }).then(gunzip).then(function (txt) {
      var d = JSON.parse(txt);
      window.RT_LIB = d.lib; window.RT_DEFAULTS = d.defaults; window.RT_STORE = d.store;
      if (remember) { try { localStorage.setItem(KEYSTORE, b64(raw)); } catch (e) {} }
      app.innerHTML = "";
      return loadScript("core.js?v=" + meta.v).then(function () { return loadScript("app.js?v=" + meta.v); });
    });
  }
  function form(msg) {
    app.innerHTML = '<form class="lockscr" id="lockForm"><img src="icons/icon-192.png" alt=""><h1>루틴 점검</h1><p class="sub">비밀번호를 넣어 주십시오.</p>' +
      '<input type="password" id="pw" autocomplete="current-password" required autofocus>' +
      '<label class="tgl"><input type="checkbox" id="rem" checked> 이 기기에서 기억하기</label>' +
      '<button class="btn" type="submit">열기</button>' + (msg ? '<p class="err">' + msg + "</p>" : "") + "</form>";
    document.getElementById("lockForm").onsubmit = function (e) {
      e.preventDefault();
      var pw = document.getElementById("pw").value, rem = document.getElementById("rem").checked;
      app.querySelector("button").disabled = true;
      derive(pw, meta).then(function (raw) { return open(raw, rem); }).catch(function () { form("비밀번호가 맞지 않습니다."); });
    };
  }
  window.RT_LOCK = function () { try { localStorage.removeItem(KEYSTORE); localStorage.removeItem("rt_auth"); } catch (e) {} location.reload(); };
  getJSON("k.json").then(function (m) {
    meta = m;
    var saved = null; try { saved = localStorage.getItem(KEYSTORE); } catch (e) {}
    if (saved) return open(unb64(saved), false).catch(function () { try { localStorage.removeItem(KEYSTORE); } catch (e) {} form(); });
    form();
  }).catch(function () { app.innerHTML = '<p class="sub" style="text-align:center;margin-top:30vh">불러오지 못했습니다. 새로고침해 주십시오.</p>'; });
})();
