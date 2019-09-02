#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');
const vito       = require('./vito');

(async() => {
  const config = await configFile.read();
  const params = {config};

  const log = logging(params);

  // read Vito data
  const vitoResult = await vito.getTemperature();

  log.debug('temperature = ', vitoResult.temperatureOutside);
})();
