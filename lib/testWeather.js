#!/usr/bin/env node

'use strict';

const moment     = require('moment');
const suncalc    = require('suncalc');

const configFile = require('./configFile');
const logging    = require('./logging');
const weather    = require('./weather');



// read Weather data

(async() => {
  const config = await configFile.read();
  const params = {config};

  params.log = logging(params);

  const currentTime = moment();
  const sunTimes      = suncalc.getTimes(new Date(), config.sunCalcLocation.latitude, config.sunCalcLocation.longitude);

  const data          = await weather.getData(params);
  const nightDownTime = weather.getNightDownTime(params, data, sunTimes, currentTime);

  params.log.debug({data, nightDownTime});
})();
