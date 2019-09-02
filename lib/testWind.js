#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');
const wind       = require('./wind');



(async() => {
  const config = await configFile.read();
  const params = {config};

  params.log = logging(params);

  wind.init(params);

  let lastCounter   = 0;
  let lastThreshold = 0;

  setInterval(async() => {
    // read wind data, as collected by interrupt handler
    const windThreshold = await wind.getThreshold(params);

    if(lastCounter !== windThreshold.counter || lastThreshold !== windThreshold.threshold) {
      lastCounter   = windThreshold.counter;
      lastThreshold = windThreshold.threshold;

      params.log.debug('windThreshold', windThreshold);
    }
  }, 1000);
})();
