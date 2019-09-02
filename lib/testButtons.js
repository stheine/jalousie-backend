#!/usr/bin/env node

'use strict';

const Action     = require('./Action');
const buttons    = require('./buttons');
const configFile = require('./configFile');
const logging    = require('./logging');

(async() => {
  const config  = await configFile.read();
  const params = {config};

  params.log = logging(params);

  params.action = new Action(params);

  buttons.init(params);

  setInterval(async() => {
    // Do nothing
  }, 1000);
})();
