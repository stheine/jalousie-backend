'use strict';

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
    document.getElementById('momentanLeistung').style.backgroundColor = 'gray';
    document.getElementById('momentanLeistung').textContent = 'offline';

    return;
  }

  getDataRunning = true;
  callApi('/rest/status', true).then(status => { // TODO auth -> rest //    url: '/j/rest/status',
    getDataRunning = false;
    if(status.process) {
//      console.log(status);
      if(status.process === 'stopped') {
        // Strom
        document.getElementById('momentanLeistung').textContent = '-';
      } else {
        // Strom
        updateIfSet(status, 'momentanLeistung');
      }
    }
  })
  .catch(err => {
    getDataRunning = false;

    document.getElementById('momentanLeistung').textContent = '-';
  });
};

$(document).ready(() => { // TODO jquery -> native
  // Schedule the update function to run every second.
  // This survives the computer hibernating (contrary to setTimeout())
  setInterval(getData, 1000);
});
