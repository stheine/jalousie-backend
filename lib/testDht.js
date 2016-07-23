#!/usr/bin/env node
'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal = require('./signal');



let pi;

const cleanup = function() {
  return new Promise(resolve => {
    logInfo('Quit process\n\n\n');

    if(pi) {
      pigpiod.pigpio_stop(pi);
      pi = undefined;
    }

    process.exit();
  });
};

signal.installCleanupOnStop(cleanup);


// sets up the pigpio library
pi = pigpiod.pigpio_start();
if(pi < 0) {
  logError('Failed to pigpio_start()');

  throw new Error('Failed to pigpio_start()');
}


setInterval(() => {
  // read DHT22 data
  pigpiod.dht(pi, 18)
  .then(dhtData => {
    logDebug('dhtData', dhtData);
//    logDebug(`temperature = ${temperature.toFixed(1)}`);
  })
  .catch(err => {
    logError(err);
  });
}, 10000); // Do not run more often, otherwise the requests will fail.
