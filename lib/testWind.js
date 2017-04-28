#!/usr/bin/env node

'use strict';

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
const logging    = require('./logging');
const signal     = require('./signal');
const wind       = require('./wind');



const globals = {};

configFile.read().then(config => {
  if(!config) {
    throw new Error('Failed to read configuration.');
  }

  globals.config = config;
  globals.log = logging(globals);

  signal.installCleanupOnStop(globals);

  globals.pi = pigpiod.pigpio_start();
  if(globals.pi < 0) {
    throw new Error('Failed to pigpio_start()');
  }

  wind.init(globals);

  setInterval(() => {
    // read wind data, as collected by interrupt handler
    wind.getThreshold(globals)
    .then(windThreshold => {
      globals.log.debug('windThreshold', windThreshold);
    });
  }, 1000);
})
.catch(err => {
  throw err;
});
