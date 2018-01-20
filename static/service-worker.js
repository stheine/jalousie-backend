'use strict';

/* eslint-disable no-undef */

// Use a cacheName for cache versioning
const cacheName = 'jalousie:v25';

const filesToCache = [
  '/j/',
  '/j/index.html',
  '/j/app.js',
  '/j/jalousie.js',
  '/j/jalousie.css',
  '/j/jalousie21.png',
  '/j/jalousie144.png',
  '/j/auth0-js/build/auth0.js',
];

// During the installation phase, you'll usually want to cache static assets.
self.addEventListener('install', event => {
  // Once the service worker is installed, go ahead and fetch the resources to make this work offline.
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(filesToCache).then(() => {
      self.skipWaiting();
    }))
  );
});

// Update cache, if cacheName differs (increase version number)
self.addEventListener('activate', event => {
//  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then(keyList => Promise.all(keyList.map(key => {
      if(key !== cacheName) {
//        console.log('[ServiceWorker] Removing old cache', key);
        return caches.delete(key);
      }

      return Promise.resolve();
    })))
  );

  return self.clients.claim();
});

// when the browser fetches a URL…
self.addEventListener('fetch', event => {
  // … either respond with the cached object or go ahead and fetch the actual URL
  event.respondWith(
    caches.match(event.request).then(response => {
      if(response) {
        // retrieve from cache
//        console.log('from cache');
        return response;
      }
      // fetch as normal
//      console.log('from network');

      return fetch(event.request);
    })
  );
});
