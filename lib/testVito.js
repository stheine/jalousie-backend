#!/usr/bin/env node
'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');
const vito       = require('./vito');



const globals = {};

configFile.read().then(config => {
  if(!config) {
    throw new Error('Failed to read configuration.');
  }

  globals.config = config;
  globals.log = logging(globals);

  // read Vito data
  vito.getTemperature()
  .then(vito => {
    globals.log.debug('temperature = ', vito.temperatureOutside);
  });
});
