// 알림 전용 service worker. 페이지를 캐시하지 않는다(판이 바뀌면 바로 새 판이 뜨게).
// GitHub Actions(.github/push.mjs)가 암호화한 내용({title, body, url, tag})을 보내면 여기서 띄운다.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "오늘의 루틴", {
    body: d.body || "오늘 루틴을 확인해 주십시오.",
    icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || "routine", renotify: true, data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ("focus" in cs[i]) { if ("navigate" in cs[i]) cs[i].navigate(url).catch(function () {}); return cs[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
