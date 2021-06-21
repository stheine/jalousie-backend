'use strict';

const _           = require('lodash');
const check       = require('check-types-2');
const dayjs       = require('dayjs');
const millisecond = require('millisecond');
const needle      = require('needle');
const suncalc     = require('suncalc');
const utc         = require('dayjs/plugin/utc');

const logger      = require('./logger');

dayjs.extend(utc);

// https://openweathermap.org/api/one-call-api

let lastDownTime;

const getData = async function({openWeatherLocation, suncalcLocation}) {
  // Getting data from OpenWeatherMap and extract the relevant information.
  const host  = 'api.openweathermap.org';
  const base  = '/data/2.5';
  const appId = `&APPID=${openWeatherLocation.appId}`;

  try {
    const resultRaw = await await needle(
      'get',
      `https://${host}${base}/onecall?` +
        `&lat=${suncalcLocation.latitude}` +
        `&lon=${suncalcLocation.longitude}` +
        `&exclude=minutely,daily` +
        `&lang=de` +
        `&units=metric` +
        `${appId}`,
      null,
      {
        json:    true,
        timeout: millisecond('2 seconds'),
      }
    );

    check.assert.object(resultRaw, `resultRaw not an object`);
    check.assert.equal(resultRaw.statusCode, 200, `Unexpected statusCode=${resultRaw.statusCode}`);

    const {body} = resultRaw;
    const {current, hourly} = body;
    const next2Hours  = hourly.slice(0, 2);
    const next10Hours = hourly.slice(0, 10);
    const forecast2MaxClouds  = _.max(_.map(next2Hours, 'clouds'));
    const forecast2MaxTemp    = _.max(_.map(next2Hours, 'temp'));
    const forecast10MaxWind   = _.max(_.map(next10Hours, 'wind_speed'));
    const forecast10MinTemp   = _.min(_.map(next10Hours, 'temp'));

    // logger.debug(resultRaw);

    const result = {
      clouds:      current.clouds,
      main:        current.weather[0].main,
      description: current.weather[0].description,
      forecast2MaxClouds,
      forecast2MaxTemp,
      forecast10MaxWind,
      forecast10MinTemp,
    };

    // logger.debug(result);

    return result;
  } catch(err) {
    logger.error('Weather: Failed to get', err.message);
  }
};

const calcNightDownTime = function(data, sunTimes, currentTime) {
  let offsetMinutes;

  // https://openweathermap.org/weather-conditions
  switch(data.main) {
    case  'Clear':
      offsetMinutes = 0;
      break;

    case  'Atmosphere':
    case  'Clouds':
    case  'Drizzle':
    case  'Fog':
    case  'Mist':
    case  'Rain':
    case  'Snow':
    case  'Thunderstorm':
      if(data.clouds > 80) {
        offsetMinutes = -7;
      } else {
        offsetMinutes = 0;
      }
      break;

    default:
      logger.error(`Weather: Unhandled data ${JSON.stringify(data, null, 2)}`);
      offsetMinutes = 0;
      break;
  }

  const dusk     = dayjs.utc(sunTimes.dusk).local();
  const sunset   = dayjs.utc(sunTimes.sunset).local();
  const duration = dusk - sunset;
  let   downTime = sunset.add(duration * 0.7).add(offsetMinutes, 'minutes');

  if(!lastDownTime) {
    // The night down time had not been calculated yet.
    logger.info(`Weather: Night down time initial calculation:\n` +
      `                    sunset: ${sunset.format('HH:mm')}\n` +
      `                    dusk: ${dusk.format('HH:mm')}\n` +
      `                    weather: ${data.main} ` +
                           `(${data.description}, ${data.clouds}%), ` +
                           `offset=${offsetMinutes}\n` +
      `                    downTime: ${downTime.format('HH:mm')}`);
  } else if(lastDownTime.format('HH:mm') !== downTime.format('HH:mm')) {
    // The night down time has changed.
    // Check if the changed night down time has already passed.
    if(downTime.isBefore(currentTime) &&
       currentTime.isBefore(lastDownTime)
    ) {
      logger.info(`Weather: New night down time has already passed -> TRIGGER NOW\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${data.main} ` +
                             `(${data.description}, ${data.clouds}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${downTime.format('HH:mm')}`);

      downTime = currentTime;
    } else {
      logger.info(`Weather: Night down time update:\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${data.main} ` +
                             `(${data.description}, ${data.clouds}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${downTime.format('HH:mm')}`);
    }
  }

  lastDownTime = downTime;

  return downTime;
};

const get = async function({openWeatherLocation, suncalcLocation}) {
  check.assert.object(openWeatherLocation, 'openWeatherLocation missing');
  check.assert.object(suncalcLocation, 'suncalcLocation missing');

  const currentTime = dayjs();

  // Calculate sunrise & sunset
  const sunTimes = suncalc.getTimes(new Date(), suncalcLocation.latitude, suncalcLocation.longitude);

  // Get weather data
  const data = await getData({openWeatherLocation, suncalcLocation});

  const nightDownTime = calcNightDownTime(data, sunTimes, currentTime);

  // logger.debug('getNightDownTime', nightDownTime.format('HH:mm'));

  return {
    ...data,
    nightDownTime,
    sunrise: dayjs.utc(sunTimes.sunrise).local(),
    sunset:  dayjs.utc(sunTimes.sunset).local(),
  };
};

module.exports = {
  get,
};
