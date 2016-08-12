#!/usr/bin/env node
'use strict';

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod  = require('@stheine/pigpiod');
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal = require('./signal');
const kty81  = require('./kty81');



// *************************************************************************
// Globals

// Connection to pigpiod
let pi;
let spi;



const cleanup = function() {
  return new Promise(resolve => {
    logInfo('cleanup');

    if(spi) {
      pigpiod.spi_close(pi, spi);
      spi = undefined;
    }

    if(pi) {
      pigpiod.pigpio_stop(pi);
      pi = undefined;
    }

    resolve();
  });
};

signal.installCleanupOnStop(cleanup);



// *************************************************************************
// main()

// sets up the pigpio library
pi = pigpiod.pigpio_start();
if(pi < 0) {
  logError('Failed to pigpio_start()');

  throw new Error('Failed to pigpio_start()');
}

spi = pigpiod.spi_open(pi, 0, 500000, 0);
if(spi < 0) {
  logError('Failed to spi_open()');

  throw new Error('Failed to spi_open()');
}

setInterval(() => {
  // read KTY81 data
  kty81.getTemperature(pi, spi)
  .then(temperature => {
    logDebug(`temperature = ${temperature.toFixed(1)}`);
  });
}, 1000);
