#!/usr/bin/env node

import configFile from './configFile';
import logger     from './logger';
import weather    from './weather';

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
