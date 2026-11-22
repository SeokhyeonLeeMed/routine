// 3D 근육 보기 (three.js r160, vendor/). app.js가 import("./viewer.js")로 불러 쓴다.
//   const v = await mount(el, { lib, primary: [근육 id], secondary: [근육 id], focus: true })
//   v.set({ primary, secondary })   v.dispose()
// 모델: model/body.json + body.bin (Z-Anatomy, CC BY-SA 4.0 — _tools/model/build_model.py가 만든다)
//   근육(m)·뼈(b)마다 정점 int16(양자화)·삼각형 uint16(부위 안 번호), 부위 = [이름, 쪽(l/r/''), 정점 시작, 정점 수, 삼각형 시작, 삼각형 수]
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

let MODEL = null;
function loadModel() {
  if (!MODEL) {
    const base = new URL("model/", document.baseURI);
    MODEL = Promise.all([
      fetch(new URL("body.json", base)).then((r) => { if (!r.ok) throw new Error("model json"); return r.json(); }),
      fetch(new URL("body.bin", base)).then((r) => { if (!r.ok) throw new Error("model bin"); return r.arrayBuffer(); }),
    ]).then(([info, buf]) => decode(info, buf)).catch((e) => { MODEL = null; throw e; });
  }
  return MODEL;
}

function decode(info, buf) {
  const lo = info.min, hi = info.max, sp = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const out = { info, center: new THREE.Vector3(0, (lo[1] + hi[1]) / 2, 0), height: sp[1] };
  for (const k of ["m", "b"]) {
    const I = info[k];
    const q = new Int16Array(buf, I.pos, I.nv * 3);
    const pos = new Float32Array(I.nv * 3);
    for (let i = 0; i < I.nv * 3; i += 3) {
      pos[i] = lo[0] + ((q[i] + 32768) / 65535) * sp[0];
      pos[i + 1] = lo[1] + ((q[i + 1] + 32768) / 65535) * sp[1];
      pos[i + 2] = lo[2] + ((q[i + 2] + 32768) / 65535) * sp[2];
    }
    const i16 = new Uint16Array(buf, I.idx, I.nt * 3);
    const idx = new Uint32Array(I.nt * 3);
    const triPart = new Uint16Array(I.nt);
    I.parts.forEach((p, pi) => {
      const vo = p[2], to = p[4], nt = p[5];
      for (let t = to * 3; t < (to + nt) * 3; t++) idx[t] = i16[t] + vo;
      triPart.fill(pi, to, to + nt);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    out[k] = { geo: g, parts: I.parts, idx, triPart, pos, nrm: g.getAttribute("normal").array };
  }
  return out;
}

function partLabel(p) {
  let n = p[0].replace(/^\((.*)\)$/, "$1").replace(/ muscles?$/, "");
  n = n.charAt(0).toUpperCase() + n.slice(1);
  return p[1] === "l" ? n + " (left)" : p[1] === "r" ? n + " (right)" : n;
}

// 근육 id(또는 묶음 id) → 부위 이름 집합
function resolve(lib, ids) {
  const names = new Set(), seen = new Set();
  (ids || []).forEach(function add(id) {
    if (seen.has(id)) return;
    seen.add(id);
    if (lib.groups && lib.groups[id]) { lib.groups[id].forEach(add); return; }
    const m = lib.muscles[id];
    if (m) m.parts.forEach((n) => names.add(n));
  });
  return names;
}
// 대상 근육의 절반 넘게가 깊은 근육이면 투시로 시작한다(겉근육을 반투명하게)
function mostlyDeep(lib, ids) {
  let deep = 0, all = 0;
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return; seen.add(id);
    if (lib.groups && lib.groups[id]) { lib.groups[id].forEach(walk); return; }
    if (lib.muscles[id]) { all++; if (lib.muscles[id].deep) deep++; }
  };
  (ids || []).forEach(walk);
  return all > 0 && deep * 2 > all;
}
// 보는 방향 후보(수평 각): 앞·뒤를 조금 더 좋아한다(좌우 대칭 근육은 앞뒤에서 둘 다 보이므로)
const VIEWS = [[0, 1.15], [Math.PI, 1.15], [Math.PI / 2, 1], [-Math.PI / 2, 1], [Math.PI / 4, 1.05], [-Math.PI / 4, 1.05], [Math.PI * 3 / 4, 1.05], [-Math.PI * 3 / 4, 1.05]];
// 부위 이름 → 근육 사전 id
function ownerMap(lib) {
  const m = {};
  for (const id in lib.muscles) lib.muscles[id].parts.forEach((n) => { m[n] = id; });
  return m;
}

function cssVar(el, name, fb) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fb;
}

export async function mount(el, opts) {
  el.classList.add("v3d");
  el.innerHTML = '<div class="v3d-load">3D 모형을 불러오는 중…</div>';
  let M;
  try { M = await loadModel(); } catch (e) { el.innerHTML = '<div class="v3d-load">3D 모형을 불러오지 못했습니다.</div>'; throw e; }
  if (!el.isConnected) return { set() {}, dispose() {} };
  const lib = opts.lib, owners = ownerMap(lib);
  el.innerHTML = "";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8078, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.6, 0.8, 1);
  camera.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(-1, 0.3, -0.6);
  camera.add(rim);

  const C = {
    pri: cssVar(el, "--m-pri", "#e5383b"), sec: cssVar(el, "--m-sec", "#f4a259"),
    base: cssVar(el, "--m-base", "#cfc4bb"), bone: cssVar(el, "--m-bone", "#efe9de"),
  };
  const mat = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(c), roughness: 0.62, metalness: 0, side: THREE.DoubleSide }, extra || {}));
  const mats = {
    pri: mat(C.pri, { emissive: new THREE.Color(C.pri), emissiveIntensity: 0.18 }),
    sec: mat(C.sec, { emissive: new THREE.Color(C.sec), emissiveIntensity: 0.1 }),
    base: mat(C.base), bone: mat(C.bone, { roughness: 0.8 }),
  };
  const shared = (src) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", src.geo.getAttribute("position"));
    g.setAttribute("normal", src.geo.getAttribute("normal"));
    return g;
  };
  const meshes = {
    pri: new THREE.Mesh(shared(M.m), mats.pri), sec: new THREE.Mesh(shared(M.m), mats.sec),
    base: new THREE.Mesh(shared(M.m), mats.base), bone: new THREE.Mesh(M.b.geo, mats.bone),
  };
  meshes.bone.userData.tri = M.b.triPart; meshes.bone.userData.kind = "b";
  Object.values(meshes).forEach((m) => scene.add(m));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI - 0.25;
  controls.minDistance = 0.5; controls.maxDistance = 6;
  controls.rotateSpeed = 0.8;

  // 겉 막대: 방향 단추·투시·범례
  const bar = document.createElement("div");
  bar.className = "v3d-bar";
  bar.innerHTML = '<button type="button" data-v="front">앞</button><button type="button" data-v="back">뒤</button><button type="button" data-v="side">옆</button><button type="button" data-v="all">전신</button><button type="button" data-v="xray" aria-pressed="false">투시</button>';
  el.appendChild(bar);
  const tag = document.createElement("div");
  tag.className = "v3d-tag"; tag.hidden = true;
  el.appendChild(tag);
  const legend = document.createElement("div");
  legend.className = "v3d-legend";
  legend.innerHTML = '<span><i class="sw pri"></i>주로 쓰는 근육</span><span><i class="sw sec"></i>함께 쓰는 근육</span>';
  el.appendChild(legend);

  let raf = 0, alive = true, xray = false, autoX = false, frame = null;
  function render() { renderer.render(scene, camera); }
  function loop() {
    raf = 0;
    if (!alive) return;
    const moved = controls.update();
    render();
    if (moved || dragging) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  let dragging = false;
  controls.addEventListener("start", () => { dragging = true; kick(); });
  controls.addEventListener("end", () => { dragging = false; kick(); });
  controls.addEventListener("change", kick);

  function size() {
    const w = el.clientWidth || 300, h = el.clientHeight || 360;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);

  function setX(on) {
    xray = on;
    bar.querySelector('[data-v="xray"]').setAttribute("aria-pressed", on ? "true" : "false");
    mats.base.transparent = on; mats.base.opacity = on ? 0.14 : 1; mats.base.depthWrite = !on;
    mats.base.needsUpdate = true;
    meshes.base.renderOrder = on ? 2 : 0;
    kick();
  }

  // 방향: 앞(+z), 뒤(-z), 옆(+x 쪽), az = 수평 각(라디안)
  function place(cam, az, b) {
    const c = b ? b.getCenter(new THREE.Vector3()) : M.center.clone();
    const sz = b ? b.getSize(new THREE.Vector3()) : new THREE.Vector3(0.6, M.height, 0.4);
    const h = Math.min(Math.max(sz.y * 1.35, sz.x * 1.5, 0.95), M.height * 1.12);
    const dist = h / 2 / Math.tan((cam.fov * Math.PI) / 360) / Math.min(1, cam.aspect * 1.25);
    cam.position.set(c.x + Math.sin(az) * dist, c.y + dist * 0.06, c.z + Math.cos(az) * dist);
    cam.lookAt(c);
    return c;
  }
  function look(az, box) {
    const c = place(camera, az, box || frame);
    controls.target.copy(c);
    controls.update();
    kick();
  }
  // 대상 근육이 가장 많이 보이는 방향: 후보 방향마다 작은 화면에 대상만 흰색, 나머지는 검정(가림막)으로 그려 흰 점을 센다.
  // (법선으로 고르면 Latissimus dorsi·Trapezius 같은 얇은 판 근육은 앞뒷면이 상쇄돼 방향을 잘못 고른다)
  const RW = 96, RH = 120;
  let probe = null;
  function bestView(target, box) {
    if (!probe) probe = { rt: new THREE.WebGLRenderTarget(RW, RH), buf: new Uint8Array(RW * RH * 4), white: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), black: new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }), cam: new THREE.PerspectiveCamera(30, RW / RH, 0.05, 20) };
    const saved = {}, vis = {};
    for (const k in meshes) { saved[k] = meshes[k].material; vis[k] = meshes[k].visible; meshes[k].material = k === target ? probe.white : probe.black; }
    if (xray) meshes.base.visible = false; // 투시 중이면 겉근육은 가리지 않는다
    const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    const sc = VIEWS.map(([az, bias]) => {
      place(probe.cam, az, box);
      renderer.setRenderTarget(probe.rt); renderer.clear(); renderer.render(scene, probe.cam);
      renderer.readRenderTargetPixels(probe.rt, 0, 0, RW, RH, probe.buf);
      let n = 0; for (let i = 0; i < probe.buf.length; i += 4) if (probe.buf[i] > 127) n++;
      return n * bias;
    });
    renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
    for (const k in meshes) { meshes[k].material = saved[k]; meshes[k].visible = vis[k]; }
    let best = 0; sc.forEach((s, d) => { if (s > sc[best]) best = d; });
    return VIEWS[best][0];
  }
  let curAz = 0;
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const v = b.dataset.v;
    if (v === "xray") { setX(!xray); return; }
    if (v === "all") { look(curAz, null); return; }
    curAz = v === "front" ? 0 : v === "back" ? Math.PI : Math.PI / 2 * (curAz === Math.PI / 2 ? -1 : 1);
    look(curAz, frame);
  });

  // 누르면(끌지 않고) 그 부위 이름
  const ray = new THREE.Raycaster();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) { downAt = null; return; }
    downAt = null;
    const r = renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const targets = [meshes.pri, meshes.sec].concat(xray ? [] : [meshes.base]).concat([meshes.bone]);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) { tag.hidden = true; return; }
    const ud = hit.object.userData, part = (ud.kind === "b" ? M.b : M.m).parts[ud.tri[hit.faceIndex]];
    const own = ud.kind === "m" ? owners[part[0]] : null;
    const reg = own ? lib.muscles[own].en : null;
    const nm = partLabel(part);
    tag.innerHTML = "<b>" + nm + "</b>" + (reg && reg.toLowerCase() !== nm.replace(/ \((left|right)\)$/, "").toLowerCase() ? "<span>" + reg + "</span>" : "") + (ud.kind === "b" ? "<span>bone</span>" : "");
    tag.hidden = false;
    if (opts.onPick) opts.onPick(own, part);
  });

  function set(o) {
    const pri = resolve(lib, o.primary), sec = resolve(lib, o.secondary);
    pri.forEach((n) => sec.delete(n));
    const P = M.m.parts, cls = new Uint8Array(P.length); // 0 base, 1 pri, 2 sec
    P.forEach((p, i) => { cls[i] = pri.has(p[0]) ? 1 : sec.has(p[0]) ? 2 : 0; });
    const cnt = [0, 0, 0];
    P.forEach((p, i) => { cnt[cls[i]] += p[5]; });
    const arr = [new Uint32Array(cnt[0] * 3), new Uint32Array(cnt[1] * 3), new Uint32Array(cnt[2] * 3)];
    const tri = [new Uint16Array(cnt[0]), new Uint16Array(cnt[1]), new Uint16Array(cnt[2])];
    const at = [0, 0, 0];
    const box = new THREE.Box3(), tmp = new THREE.Vector3();
    const pos = M.m.pos;
    P.forEach((p, i) => {
      const c = cls[i], to = p[4], nt = p[5];
      arr[c].set(M.m.idx.subarray(to * 3, (to + nt) * 3), at[c] * 3);
      tri[c].fill(i, at[c], at[c] + nt);
      at[c] += nt;
      if (c === 1 || (c === 2 && !pri.size)) {
        for (let v = p[2]; v < p[2] + p[3]; v++) box.expandByPoint(tmp.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
      }
    });
    [["base", 0], ["pri", 1], ["sec", 2]].forEach(([k, c]) => {
      meshes[k].geometry.setIndex(new THREE.BufferAttribute(arr[c], 1));
      meshes[k].geometry.computeBoundingSphere();
      meshes[k].userData.tri = tri[c]; meshes[k].userData.kind = "m";
      meshes[k].visible = cnt[c] > 0;
    });
    autoX = mostlyDeep(lib, o.primary && o.primary.length ? o.primary : o.secondary);
    setX(o.xray != null ? o.xray : autoX);
    frame = box.isEmpty() ? null : box;
    curAz = frame ? bestView(cnt[1] ? "pri" : "sec", o.focus === false ? null : frame) : 0;
    look(curAz, o.focus === false ? null : frame);
    tag.hidden = true;
  }

  set(opts);
  size();
  return {
    set,
    dispose() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); controls.dispose();
      if (probe) { probe.rt.dispose(); probe.white.dispose(); probe.black.dispose(); }
      ["pri", "sec", "base"].forEach((k) => meshes[k].geometry.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      renderer.dispose();
      el.innerHTML = "";
    },
  };
}

// 미리 받아 두기(첫 화면에서 쉬는 동안)
export function preload() { return loadModel().catch(() => null); }
