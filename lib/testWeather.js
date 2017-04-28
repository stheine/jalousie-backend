#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const moment     = require('moment');

const {logDebug} = require('./troubleshooting');

const weather    = require('./weather');



// read Weather data
weather.getData({
  location: {
    city:    'Nufringen',
    country: 'Germany',
    region:  'BW'
  }
})
.then(weatherData => {
  const nightDownTime = weather.getNightDownTime(weatherData, moment());

  console.log({
    weatherCode:   weatherData.code,
    weatherText:   weatherData.text,
    sunrise:       weatherData.sunrise.format('HH:mm'),
    sunset:        weatherData.sunset.format('HH:mm'),
    nightDownTime: nightDownTime.format('HH:mm')
  });
})
.catch(err => {
  logDebug(err);
});
