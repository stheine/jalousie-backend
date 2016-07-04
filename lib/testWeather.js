'use strict';

const {logDebug} = require('./troubleshooting');

const weather = require('./weather');


// read Weather data
weather.getNightTime()
.then(weatherData => {
  logDebug(weatherData);
});
