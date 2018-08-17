'use strict';

// TODO query -> native:
//   $('#<id>') -> const loginView = document.getElementById('login-view');

//   button click ->
//     loginBtn.addEventListener('click', event => {
//       event.preventDefault();
//       webAuth.authorize();
//     });


/* eslint-disable no-undef */
/* eslint-disable no-alert */

const apiUrl = 'https://heine7.de/j';

const callApi = function(endpoint, secured) {
  return new Promise((resolve, reject) => {
    const url = apiUrl + endpoint;
    const xhr = new XMLHttpRequest();

    xhr.open('GET', url);
    if(secured) {
      const accessToken = localStorage.getItem('access_token');

      if(!accessToken || accessToken.length === 16) {
        return reject(new Error(`The accessToken doesn't look right '${accessToken}'`));
      }
      xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('access_token'));
    }
    xhr.onload = function() {
      switch(xhr.status) {
        case 200: // ok
          return resolve(JSON.parse(xhr.responseText));

        case 401: // Unauthorized
          localStorage.removeItem('expires_at');

          return reject(new Error('Authentication failed')); // TODO trigger new authentication

        default:
          return reject(new Error(`Request ${endpoint} failed: ${xhr.status}/${xhr.statusText}`));
      }
    };
    xhr.send();
  });
};


const updateIfSet = function(status, label) {
  if(status[label] === undefined || status[label] === false) {
    document.getElementById(label).textContent = '-';
  } else if(status[label] === true) {
    document.getElementById(label).textContent = 'X';
  } else {
    document.getElementById(label).textContent = status[label];
  }
};

let   getDataRunning = false;
const getData = function() {
  if(getDataRunning) {
    return;
  }

  if(!navigator.onLine) {
    document.getElementById('process').style.backgroundColor = 'gray';
    document.getElementById('process').textContent = 'offline';

    return;
  }

  getDataRunning = true;
  callApi('/rest/status', true).then(status => { // TODO auth -> rest //    url: '/j/rest/status',
    getDataRunning = false;
    if(status.process) {
//      console.log(status);
      if(status.process === 'stopped') {
        document.getElementById('process').style.backgroundColor = 'red';

        // Anzeige
        document.getElementById('temperatureOutside').textContent = '-';
//        document.getElementById('temperatureKty').textContent = '-';
        document.getElementById('temperatureDht').textContent = '-';
        document.getElementById('humidity').textContent = '-';
        document.getElementById('sunThreshold').textContent = '-';
        document.getElementById('windThreshold').textContent = '-';
        document.getElementById('mode').textContent = '-';
        document.getElementById('weatherCode').textContent = '-';
        document.getElementById('weatherText').textContent = '-';

        // Internals
        document.getElementById('process').textContent = status.process;
//        document.getElementById('temperatureKtyWiderstand').textContent = '-';
//        document.getElementById('sonneA2Dval').textContent = '-';
//        document.getElementById('windHertz').textContent = '-';
        document.getElementById('time').textContent = '-';
        document.getElementById('flagNight').textContent = '-';
        document.getElementById('flagSun').textContent = '-';
        document.getElementById('flagWindalarm').textContent = '-';
        document.getElementById('timerSunUp').textContent = '-';
        document.getElementById('timerSunDown').textContent = '-';
        document.getElementById('timerWind').textContent = '-';
        document.getElementById('nightDownTime').textContent = '-';

        // Strom
        document.getElementById('momentanLeistung').textContent = '-';
      } else if(status.process === 'running') {
        document.getElementById('process').style.backgroundColor = 'transparent';

        // Anzeige
        updateIfSet(status, 'temperatureOutside');
//        updateIfSet(status, 'temperatureKty');
        updateIfSet(status, 'temperatureDht');
        updateIfSet(status, 'humidity');
        updateIfSet(status, 'sunThreshold');
        updateIfSet(status, 'windThreshold');
        updateIfSet(status, 'mode');
        updateIfSet(status, 'weatherCode');
        updateIfSet(status, 'weatherText');

        // Internals
        updateIfSet(status, 'process');
//        updateIfSet(status, 'temperatureKtyWiderstand');
//        updateIfSet(status, 'sonneA2Dval');
//        updateIfSet(status, 'windHertz');
        updateIfSet(status, 'time');
        updateIfSet(status, 'flagNight');
        updateIfSet(status, 'flagSun');
        updateIfSet(status, 'flagWindalarm');
        updateIfSet(status, 'timerSunUp');
        updateIfSet(status, 'timerSunDown');
        updateIfSet(status, 'timerWind');
        updateIfSet(status, 'nightDownTime');

        // Strom
        updateIfSet(status, 'momentanLeistung');
      } else {
        document.getElementById('process').style.backgroundColor = 'yellow';

        // Internals
        document.getElementById('process').textContent = status.process;
      }
    }
  })
  .catch(err => {
    getDataRunning = false;

    document.getElementById('process').style.backgroundColor = 'red';

    // Anzeige
    document.getElementById('temperatureOutside').textContent = '-';
    document.getElementById('temperatureDht').textContent = '-';
    document.getElementById('humidity').textContent = '-';
    document.getElementById('sunThreshold').textContent = '-';
    document.getElementById('windThreshold').textContent = '-';
    document.getElementById('mode').textContent = '-';
    document.getElementById('weatherCode').textContent = '-';
    document.getElementById('weatherText').textContent = '-';

    // Internals
    document.getElementById('process').textContent = `down (${err.message})`;
    document.getElementById('time').textContent = '-';
    document.getElementById('flagNight').textContent = '-';
    document.getElementById('flagSun').textContent = '-';
    document.getElementById('flagWindalarm').textContent = '-';
    document.getElementById('timerSunUp').textContent = '-';
    document.getElementById('timerSunDown').textContent = '-';
    document.getElementById('timerWind').textContent = '-';
    document.getElementById('nightDownTime').textContent = '-';

    // Strom
    document.getElementById('momentanLeistung').textContent = '-';
  });
};

$(document).ready(() => { // TODO jquery -> native
  // Initialize jquery-ui elements
  $('button').button(); // TODO jquery -> native

  // Set click events
  document.getElementById('fullUp').addEventListener('mousedown', event => {
    event.preventDefault();
    callApi('/rest/fullUp', true);
  });

//  document.getElementById('up').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/upClick', true);
//  });

//  document.getElementById('up').addEventListener('mouseup', event => {
//    event.preventDefault();
//    callApi('/rest/upRelease', true);
//  });

  document.getElementById('stop').addEventListener('mousedown', event => {
    event.preventDefault();
    callApi('/rest/stop', true);
  });

//  document.getElementById('down').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/downClick', true);
//  });

//  document.getElementById('down').addEventListener('mouseup', event => {
//    event.preventDefault();
//    callApi('/rest/downRelease', true);
//  });

  document.getElementById('fullDown').addEventListener('mousedown', event => {
    event.preventDefault();
    callApi('/rest/fullDown', true);
  });

  document.getElementById('shadow').addEventListener('mousedown', event => {
    event.preventDefault();
    callApi('/rest/shadow', true);
  });

  document.getElementById('turn').addEventListener('mouseup', event => {
    event.preventDefault();
    callApi('/rest/turn', true);
  });

  // Schedule the update function to run every second.
  // This survives the computer hibernating (contrary to setTimeout())
  setInterval(getData, 1000);
});
