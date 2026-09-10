self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Central Pro', {
    body: data.body || 'Tem novidade na Central Pro.',
    icon: '/assets/central-pro-logo.png',
    badge: '/assets/central-pro-logo.png',
    tag: data.tag || 'central-pro',
    renotify: true,
    data: { url: data.url || '/bilhetes.html' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/bilhetes.html', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const client of windows) { if ('focus' in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
