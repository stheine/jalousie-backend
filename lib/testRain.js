#!/usr/bin/env node

'use strict';

const _          = require('lodash');
const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
const logging    = require('./logging');
const signal     = require('./signal');
const rain       = require('./rain');



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

  rain.init(globals);

  setInterval(() => _.noop, 1000);
})
.catch(err => {
  throw err;
});
