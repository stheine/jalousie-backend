#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const dht22      = require('./dht22');
const logging    = require('./logging');



(async() => {
  const config = await configFile.read();
  const globals = {
    config,
  };

  globals.log = logging(globals);

  setInterval(async() => {
    const dht22Data = await dht22();

    globals.log.debug('dht22Data', dht22Data);
  }, 3000); // Do not run more often, otherwise the requests will fail.
})();

