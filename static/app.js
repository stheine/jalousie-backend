'use strict';

/* eslint-disable no-undef */
/* eslint-disable no-console */
/* eslint-disable no-alert */

// Authentication / auth0
window.addEventListener('load', () => {
  const webAuth = new auth0.WebAuth({
    domain:       'sthones.eu.auth0.com',
    clientID:     '68iclNO5hs0NH90vxDm5dzCxs3KBUOYX',
    redirectUri:  window.location.href,
    audience:     'https://heine7.de/j/rest',
    responseType: 'token id_token',
    scope:        'openid'
  });

  const isAuthenticated = function() {
    // Check whether the current time is past the
    // access token's expiry time
    const expiresAt = JSON.parse(localStorage.getItem('expires_at'));

    return new Date().getTime() < expiresAt;
  };

//  const logout = function() {
//    // Remove tokens and expiry time from localStorage
//    localStorage.removeItem('access_token');
//    localStorage.removeItem('id_token');
//    localStorage.removeItem('expires_at');
//  };

  const setSession = function(authResult) {
    // Set the time that the access token will expire at
    const expiresAt = JSON.stringify(authResult.expiresIn * 1000 + new Date().getTime());

    localStorage.setItem('access_token', authResult.accessToken);
    localStorage.setItem('id_token', authResult.idToken);
    localStorage.setItem('expires_at', expiresAt);
  };

  const handleAuthentication = function() {
    webAuth.parseHash((err, authResult) => {
      if(authResult && authResult.accessToken && authResult.idToken) {
        window.location.hash = '';
        setSession(authResult);
      } else if(err) {
        console.log(err);
        alert('Error: ' + err.error + '. Check the console for further details.');
      }
    });
  };

  handleAuthentication();

  if(!isAuthenticated()) {
    webAuth.authorize();
  }
});



// Register the service worker if available.
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    console.log('Successfully registered service worker', reg);
  })
  .catch(err => {
    console.warn('Error whilst registering service worker', err);
  });
}

// window.addEventListener('online', function(e) {
//  // Resync data with server.
//  console.log("You are online");
//  Page.hideOfflineWarning();
//  Arrivals.loadData();
// }, false);

// window.addEventListener('offline', function(e) {
//  // Queue up events for server.
//  console.log("You are offline");
//  Page.showOfflineWarning();
// }, false);

// Check if the user is connected.
// if (navigator.onLine) {
//  Arrivals.loadData();
// } else {
//  // Show offline message
//  Page.showOfflineWarning();
// }

// Set Knockout view model bindings.
// ko.applyBindings(Page.vm);
