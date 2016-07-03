'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal = require('./signal');
const sun    = require('./sun');



// *********************************************************************************
// Globals

// Connection to pigpiod
let pi        = -1;



const cleanup = function() {
  logInfo('cleanup');

  if(pi) {
    pigpiod.pigpio_stop(pi);
    pi = undefined;
  }
};

signal.installCleanupOnStop(cleanup);



// *********************************************************************************
// main()

// sets up the pigpio library
if((pi = pigpiod.pigpio_start()) < 0) {
  logError("Failed to pigpio_start()");
  return(1);
}

setInterval(() => {
  // read sun data
  sun.getSunThreshold(pi)
  .then(sunThreshold => {
    logDebug(`sunThreshold = ${sunThreshold}`);
  });
}, 1000);
