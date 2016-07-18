#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */

const {logDebug} = require('./troubleshooting');

const weather = require('./weather');


// read Weather data
weather.getData({
  location: {
    city:    'Nufringen',
    country: 'Germany',
    region:  'BW'
  }
})
.then(weatherData => {
  console.log(weatherData);
  logDebug(weatherData);
})
.catch(err => {
  logDebug(err);
});
