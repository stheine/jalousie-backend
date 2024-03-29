#!/usr/bin/env node

import {logger}   from '@stheine/helpers';

import configFile from './configFile.js';
import weather    from './weather.js';

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
