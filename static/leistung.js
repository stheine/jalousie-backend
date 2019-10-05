'use strict';

/* eslint-disable no-undef */
/* eslint-disable no-alert */

// TODO const apiUrl = 'https://heine7.de/j';
const apiUrl = 'http://192.168.6.41:9124';

const callApi = function(endpoint) {
  return new Promise((resolve, reject) => {
    const url = apiUrl + endpoint;
    const xhr = new XMLHttpRequest();

    xhr.open('GET', url);

    xhr.onload = function() {
      switch(xhr.status) {
        case 200: // ok
          return resolve(JSON.parse(xhr.responseText));

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
const getData = async function() {
  if(getDataRunning) {
    return;
  }

  if(!navigator.onLine) {
    document.getElementById('momentanLeistung').style.backgroundColor = 'gray';
    document.getElementById('momentanLeistung').textContent = 'offline';

    return;
  }

  getDataRunning = true;
  try {
    const status = await callApi('/rest/status');

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
  } catch(err) {
    getDataRunning = false;

    document.getElementById('momentanLeistung').textContent = '-';
  }
};

$(document).ready(() => { // TODO jquery -> native
  // Schedule the update function to run every second.
  // This survives the computer hibernating (contrary to setTimeout())
  setInterval(getData, 1000);
});
