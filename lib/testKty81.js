#!/usr/bin/env node
'use strict';


// https://www.npmjs.com/package/dank-do-while
const doWhile          = require('dank-do-while');

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod = require('@stheine/pigpiod');
const logging = require('./logging');
const signal  = require('./signal');
const kty81   = require('./kty81');



// *************************************************************************
// Globals

// Connection to pigpiod
const globals = {};

globals.log = logging(globals);

signal.installCleanupOnStop(globals);



// *************************************************************************
// main()
let mainLoopStatus = 'STARTUP';

// sets up the pigpio library
globals.pi = pigpiod.pigpio_start();
if(globals.pi < 0) {
  globals.log.error('Failed to pigpio_start()');

  throw new Error('Failed to pigpio_start()');
}

globals.spi = pigpiod.spi_open(globals.pi, 0, 500000, 0);
if(globals.spi < 0) {
  globals.log.error('Failed to spi_open()');

  throw new Error('Failed to spi_open()');
}

const mainLoop = function(next) {
  // read KTY81 data
  kty81.getTemperature(globals)
  .then(temperature => {
    globals.log.debug('temperature', temperature);

    return process.nextTick(() => {next(null)});
  })
  .catch(err => {
    globals.log.error(`Failed to get KTY81 temperature (${err})`);

    return next(err);
  });
};

doWhile(next => {
  mainLoop(next);
}, () => {
  mainLoopStatus = 'STOPPED';
  globals.log.info('Terminated mainLoop');

  process.exit(0);
});
