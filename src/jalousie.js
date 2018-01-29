import request from 'superagent';

const apiUrl = 'https://heine7.de/j';

const callApi = async function(endpoint, secured) {
  const url = apiUrl + endpoint;

  request.get(url).end((err, res) => {
    if(err) {
      throw err;
    }

//  if(secured) {
//    const accessToken = localStorage.getItem('access_token');
//
//    if(!accessToken || accessToken.length === 16) {
//      return reject(new Error(`The accessToken doesn't look right '${accessToken}'`));
//    }
//    xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('access_token'));
//  }

    switch(res.status) {
      case 200: // ok
        return res.body;

//      case 401: // Unauthorized
//        localStorage.removeItem('expires_at');
//
//        throw new Error('Authentication failed'); // TODO trigger new authentication

      default:
        throw new Error(`Request ${endpoint} failed: ${res.status}/${res.statusText}`);
    }
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
    document.getElementById('process').style.backgroundColor = 'gray';
    document.getElementById('process').textContent = 'offline';

    return;
  }

  this.setState({temp: '1'});

  return;

  try {
    getDataRunning = true;
    const status = await callApi('/rest/status', true);

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
      } else {
        document.getElementById('process').style.backgroundColor = 'yellow';

        // Internals
        document.getElementById('process').textContent = status.process;
      }
    }
  } catch(err) {
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
  }
};

export const main = async function() {
  // Initialize jquery-ui elements
//  $('button').button(); // TODO jquery -> native

  // Set click events
//  document.getElementById('fullUp').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/fullUp', true);
//  });

//  document.getElementById('up').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/upClick', true);
//  });

//  document.getElementById('up').addEventListener('mouseup', event => {
//    event.preventDefault();
//    callApi('/rest/upRelease', true);
//  });

//  document.getElementById('stop').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/stop', true);
//  });

//  document.getElementById('down').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/downClick', true);
//  });

//  document.getElementById('down').addEventListener('mouseup', event => {
//    event.preventDefault();
//    callApi('/rest/downRelease', true);
//  });

//  document.getElementById('fullDown').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/fullDown', true);
//  });

//  document.getElementById('shadow').addEventListener('mousedown', event => {
//    event.preventDefault();
//    callApi('/rest/shadow', true);
//  });

//  document.getElementById('turn').addEventListener('mouseup', event => {
//    event.preventDefault();
//    callApi('/rest/turn', true);
//  });

  // Schedule the update function to run every second.
  // This survives the computer hibernating (contrary to setTimeout())
  setInterval(() => getData.bind(this)(), 1000);
};
