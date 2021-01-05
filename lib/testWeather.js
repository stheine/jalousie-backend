#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logger     = require('./logger');
const weather    = require('./weather');

// read Weather data

(async() => {
  const config = await configFile.read();

  const data = await weather.get({
    openWeatherLocation: config.openWeatherLocation,
    suncalcLocation:     config.suncalcLocation,
  });

  logger.info({
    ...data,
    nightDownTime: data.nightDownTime.format('HH:mm'),
    sunrise:       data.sunrise.format('HH:mm'),
    sunset:        data.sunset.format('HH:mm'),
  });
})();
