#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');
const sun        = require('./sun');

(async() => {
  const config = await configFile.read();
  const globals = {
    config,
  };

  globals.log = logging(globals);

  let lastThreshold = null;

  setInterval(async() => {
    // read sun data
    const sunThreshold = await sun.getThreshold(globals);

    if(lastThreshold !== sunThreshold.threshold) {
      lastThreshold = sunThreshold.threshold;

      globals.log.debug('sunThreshold', sunThreshold);
    }
  }, 1000);
})();
