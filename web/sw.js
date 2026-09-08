'use strict';

/**
 * Service Worker for Negev Events / أعراسنا Web Push (issue #85 batch 6c).
 * Self-contained, dependency-free; runs in the worker scope.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() };
    }
  }

  const title = data.title || 'أعراسنا';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: {
      notification_id: data.notification_id || null,
      event_id: data.event_id || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const eventId = event.notification.data && event.notification.data.event_id;
  const targetPath = eventId ? ('/?event_id=' + eventId) : '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then((focusedClient) => {
            const target = focusedClient || client;
            if (eventId && 'postMessage' in target) {
              target.postMessage({ type: 'NAVIGATE_EVENT', event_id: eventId });
            } else if (eventId && 'navigate' in target) {
              target.navigate(targetUrl);
            }
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
