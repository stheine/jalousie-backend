'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal   = require('./signal');
const wind     = require('./wind');



const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder

// *********************************************************************************
// Globals

// Connection to pigpiod
let pi                     = -1;



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

// initialize GPIO for Jalousie
// TODO pigpiod.set_mode(pi, GPIO_WIND, PI_INPUT);
// TODO pigpiod.set_pull_up_down(pi, GPIO_WIND, PI_PUD_UP);

// set GPIO wind to generate an interrupt on high-to-low transitions
// and attach intrGpioWind() to the interrupt
if(pigpiod.callback(pi, GPIO_WIND, pigpiod.FALLING_EDGE, wind.trigger) < 0) {
  logError("Failed to callback(pi, GPIO_WIND)");
  return(1);
}

// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
setInterval(() => {
  // read wind data, as collected by interrupt handler
  wind.getWindThreshold(pi)
  .then(windThreshold => {
    logDebug(`windThreshold = ${windThreshold}`);
  });
}, 1000);
