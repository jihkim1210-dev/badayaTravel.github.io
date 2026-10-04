// 앱 화면 파일을 기기에 저장해 인터넷이 약한 현장에서도 바로 열리게 합니다.
// 파일을 수정해 배포할 때는 VERSION 을 올리세요.
const VERSION = 'badaya-v13';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/config.js', './js/store.js', './js/calc.js', './js/seed.js', './js/excel.js',
  './icons/app-icon.svg', './icons/app-icon-192.png', './icons/app-icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 데이터(Supabase)는 항상 네트워크로
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.origin === location.origin) {
    // 앱 파일: 네트워크 우선, 실패하면 저장본
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
  } else if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.hostname)) {
    // 글꼴·라이브러리: 저장본 우선
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    })));
  }
});
