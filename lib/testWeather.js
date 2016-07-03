'use strict';

const {logDebug, logInfo, logError} = require('./troubleshooting');

const weather = require('./weather');


// read Weather data
weather.getNightTime()
.then(weatherData => {
  logDebug(weatherData);
});
