import request from 'superagent';

// const apiUrl = 'https://heine7.de/j';
const apiUrl = 'http://192.168.6.41:9125';

const callApi = async function(endpoint, secured) {
  const url = apiUrl + endpoint;

  return new Promise((resolve, reject) => {
    request.get(url).end((err, res) => {
      if(err) {
        return reject(err);
      }

//      if(secured) {
//        const accessToken = localStorage.getItem('access_token');
//
//        if(!accessToken || accessToken.length === 16) {
//          return reject(new Error(`The accessToken doesn't look right '${accessToken}'`));
//        }
//        xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('access_token'));
//      }

      switch(res.status) {
        case 200: // ok
          return resolve(res.body);

//        case 401: // Unauthorized
//          localStorage.removeItem('expires_at');
//
//          return reject(new Error('Authentication failed')); // TODO trigger new authentication

        default:
          return reject(new Error(`Request ${endpoint} failed: ${res.status}/${res.statusText}`));
      }
    });
  });
};

const getData = async function() {
  if(this.state.getDataRunning) {
    return;
  }

  if(!navigator.onLine) {
    this.setState({
      online: false,
    });

    return;
  }

  this.setState({
    online: true,
  });

  try {
    this.setState({getDataRunning: true});
    const status = await callApi('/rest/status', true);

    this.setState({getDataRunning: false, status, err: undefined});
  } catch(err) {
    this.setState({getDataRunning: false, status: {}, err});
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
