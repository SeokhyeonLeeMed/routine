// 매일 알림 보내기 (의존성 없음, Node 18+)
//   GitHub Actions: .github/push.mjs로 복사되어 remind.yml이 15분마다 돌린다(저장소 루트의 core.js를 같이 쓴다).
//   로컬 시험:      node _tools/push.mjs            (_secret/store.json·vapid.json 사용)
//                   FORCE=plan|left node _tools/push.mjs   → 시각과 상관없이 지금 한 번 보낸다(보낸 기록은 남기지 않음)
// 서버 접근은 이 사이트 전용 저장 계정(routine-site)으로만 한다 — 관리 키를 쓰지 않는다.
// 흐름: 로그인 → routine/state.json(설정·체크)·push.json(구독·보낸 기록)·calendar.json 읽기
//      → core.dueSlots로 지금 보낼 칸 고르기 → 문구 만들기(core.planText / leftText) → 구독마다 암호화(aes128gcm)해 보내기
//      → 보낸 기록·끊긴 구독(404·410) 정리해 push.json에 쓰기
// secrets: SUPABASE_URL, SUPABASE_ANON, STORE_EMAIL, STORE_PASSWORD, STORE_UID, VAPID_JWK
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../core.js");
const SITE = "https://seokhyeonleemed.github.io/routine/";
const local = (f) => { try { return fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"); } catch { return null; } };
const ls = JSON.parse(local("_secret/store.json") || "{}");
const env = (k, f) => process.env[k] || f;
const S = {
  url: env("SUPABASE_URL", ls.url), anon: env("SUPABASE_ANON", ls.anon), email: env("STORE_EMAIL", ls.email),
  password: env("STORE_PASSWORD", ls.password), uid: env("STORE_UID", ls.uid),
};
const jwk = JSON.parse(env("VAPID_JWK", local("_secret/vapid.json")) || "null");
if (!jwk || Object.values(S).some((v) => !v)) { console.error("설정 없음(SUPABASE_URL·SUPABASE_ANON·STORE_EMAIL·STORE_PASSWORD·STORE_UID·VAPID_JWK)"); process.exit(1); }
const FORCE = process.env.FORCE || "";

const tk = await (await fetch(`${S.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: S.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: S.email, password: S.password }) })).json();
if (!tk.access_token) { console.error("로그인 실패"); process.exit(1); }
const H = { apikey: S.anon, Authorization: "Bearer " + tk.access_token, "Content-Type": "application/json", Prefer: "return=representation" };
const q = (p) => `${S.url}/rest/v1/user_files?user_id=eq.${S.uid}&path=eq.${encodeURIComponent(p)}`;
async function row(p) { const r = await (await fetch(q(p) + "&select=data,ver", { headers: H })).json(); if (!Array.isArray(r)) throw new Error("읽기 실패 " + JSON.stringify(r)); return r[0] || null; }

const st = await row("routine/state.json");
if (!st || !st.data || !st.data.cfg) { console.log("아직 사이트를 연 적이 없어 설정이 없습니다."); process.exit(0); }
const cfg = st.data.cfg, log = st.data.log || {};
const calRow = await row("routine/calendar.json");
const cal = calRow && calRow.data;
let pr = await row("routine/push.json");
const subs = (pr && pr.data && pr.data.subs) || [];
const now = Date.now(), dk = C.dkey(now);

const slots = FORCE ? [{ id: "force", mode: FORCE === "left" ? "left" : "plan" }] : C.dueSlots(cfg, pr && pr.data && pr.data.sent, now);
if (!slots.length) { console.log(`${dk} ${String(Math.floor(C.nowMin(now) / 60)).padStart(2, "0")}:${String(C.nowMin(now) % 60).padStart(2, "0")} — 지금 보낼 알림 없음`); process.exit(0); }

const key = crypto.createPrivateKey({ key: jwk, format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(aud) {
  const data = b64({ typ: "JWT", alg: "ES256" }) + "." + b64({ aud, exp: Math.floor(Date.now() / 1000) + 3000, sub: SITE });
  return data + "." + crypto.sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
}
// RFC 8291 (Message Encryption for Web Push) + RFC 8188 aes128gcm, 레코드 하나
function encrypt(sub, text) {
  const uaPub = Buffer.from(sub.keys.p256dh, "base64url"), auth = Buffer.from(sub.keys.auth, "base64url");
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPub);
  const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

let bad = 0; const gone = new Set(), sentNow = [];
for (const s of slots) {
  const body = s.mode === "plan" ? C.planText(cfg, cal, log, dk) : C.leftText(cfg, cal, log, dk);
  if (s.mode === "left" && !body) { console.log(`[${s.id}] 오늘 루틴을 다 해서 보내지 않음`); sentNow.push(s.id); continue; }
  const msg = JSON.stringify({ title: s.mode === "plan" ? "오늘의 루틴" : "남은 루틴이 있습니다", body, url: "./", tag: "routine-" + s.id });
  console.log(`[${s.id}] ${body}`);
  if (!subs.length) { console.log("  구독 없음 — 보낼 곳이 없습니다."); sentNow.push(s.id); continue; }
  for (const sub of subs) {
    const u = new URL(sub.endpoint);
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: { TTL: "14400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: `vapid t=${jwt(u.origin)}, k=${pub}` },
      body: encrypt(sub, msg),
    });
    const ok = r.status >= 200 && r.status < 300;
    console.log(`  ${u.host}: ${r.status} ${ok ? "보냄" : (await r.text()).slice(0, 200)}`);
    if (r.status === 404 || r.status === 410) gone.add(sub.endpoint); else if (!ok) bad++;
  }
  sentNow.push(s.id);
}

// 보낸 기록·끊긴 구독 저장(판이 다르면 다시 읽어 합친다). FORCE는 기록하지 않는다
if (!FORCE || gone.size) {
  for (let tries = 0; tries < 4; tries++) {
    const d = (pr && pr.data) || {};
    d.subs = (d.subs || []).filter((x) => !gone.has(x.endpoint));
    d.sent = d.sent || {};
    if (!FORCE) { d.sent[dk] = d.sent[dk] || {}; sentNow.forEach((id) => { d.sent[dk][id] = now; }); }
    for (const k of Object.keys(d.sent)) if (k < C.addDays(dk, -7)) delete d.sent[k];
    const r = pr
      ? await fetch(q("routine/push.json") + `&ver=eq.${pr.ver}`, { method: "PATCH", headers: H, body: JSON.stringify({ data: d, ver: pr.ver + 1 }) })
      : await fetch(`${S.url}/rest/v1/user_files`, { method: "POST", headers: H, body: JSON.stringify({ user_id: S.uid, path: "routine/push.json", data: d, ver: 1 }) });
    const out = r.ok ? await r.json() : [];
    if (r.ok && out.length) { console.log("기록 저장" + (gone.size ? ` · 끊긴 구독 ${gone.size}개 지움` : "")); break; }
    pr = await row("routine/push.json");
    if (tries === 3) { console.error("기록 저장 실패"); bad++; }
  }
}
process.exit(bad ? 1 : 0);
