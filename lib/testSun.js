'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal = require('./signal');
const sun    = require('./sun');



const MCP3204_SPI_CHANNEL   = 0; // MCP3204 is connected to SPI channel #0
const MCP3204_CHANNEL_SONNE = 0; // Sun sensor on MCP3204 channel #0



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
  sun.getSunThreshold(pi, MCP3204_SPI_CHANNEL, MCP3204_CHANNEL_SONNE)
  .then(sunThreshold => {
    logDebug(`sunThreshold = ${sunThreshold}`);
  });
}, 1000);
