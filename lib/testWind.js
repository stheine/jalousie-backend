#!/usr/bin/env node
'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('./troubleshooting');

const signal   = require('./signal');
const wind     = require('./wind');



// *********************************************************************************
// Globals

// Connection to pigpiod
let pi;



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
pi = pigpiod.pigpio_start();
if(pi < 0) {
  logError('Failed to pigpio_start()');

  throw new Error('Failed to pigpio_start()');
}

// initialize GPIO for Jalousie
// TODO pigpiod.set_mode(pi, GPIO_WIND, PI_INPUT);
// TODO pigpiod.set_pull_up_down(pi, GPIO_WIND, PI_PUD_UP);

// Initialize the wind module to register the callback counting wind triggers
wind.initialize(pi);

// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
setInterval(() => {
  // read wind data, as collected by interrupt handler
  wind.getThreshold(pi)
  .then(windThreshold => {
    logDebug(`windThreshold = ${windThreshold}`);
  });
}, 1000);
