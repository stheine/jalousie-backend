#!/usr/bin/env node
'use strict';

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
const action     = require('./action');
const logging    = require('./logging');
const signal     = require('./signal');
const buttons    = require('./buttons');



const globals = {};

configFile.read().then(config => {
  if(!config) {
    throw new Error('Failed to read configuration.');
  }

  globals.config = config;
  globals.log = logging(globals);

  signal.installCleanupOnStop(globals);

  // sets up the pigpio library
  globals.pi = pigpiod.pigpio_start();
  if(globals.pi < 0) {
    throw new Error('Failed to pigpio_start()');
  }


  action.init(globals);
  buttons.init(globals);
  setTimeout(() => {
    signal.cleanup(globals).then(() => {
      process.exit();
    });
  }, 600000);
})
.catch(err => {
  throw err;
});
