#!/usr/bin/env node
'use strict';

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod  = require('@stheine/pigpiod');
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal = require('./signal');



let pi;

const cleanup = function() {
  return new Promise(resolve => {
    logInfo('Quit process');

    if(pi) {
      pigpiod.pigpio_stop(pi);
      pi = undefined;
    }

    resolve();
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
  const dht22Data = pigpiod.dht22(pi, 18);

  logDebug('dht22Data', dht22Data);
}, 3000); // Do not run more often, otherwise the requests will fail.
