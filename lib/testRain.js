#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');
const rain       = require('./rain');

(async() => {
  const config = await configFile.read();
  const params = {config};

  params.log = logging(params);

  await rain.init(params);

  setInterval(async() => {
    const rainData = await rain.getRain();

    params.log.debug('rainData', rainData);
  }, 1000);
})();
