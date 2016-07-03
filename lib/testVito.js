'use strict';

const {logDebug, logInfo, logError} = require('./troubleshooting');

const vito = require('./vito');


// read Vito data
vito.getTemperature()
.then(temperature => {
  logDebug(`temperature = ${temperature.toFixed(1)}`);
});
