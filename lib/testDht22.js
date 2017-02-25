#!/usr/bin/env node
'use strict';

const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
const logging    = require('./logging');
const signal     = require('./signal');



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

  setInterval(() => {
    // read DHT22 data
    pigpiod.dht22(globals.pi, 18).then(dht22Data => {
      globals.log.debug('dht22Data', dht22Data);
    });
  }, 3000); // Do not run more often, otherwise the requests will fail.
})
.catch(err => {
  throw err;
});
