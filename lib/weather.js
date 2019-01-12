'use strict';

const _       = require('lodash');
const check   = require('check-types');
const moment  = require('moment');
const request = require('request-promise-native');

const getData = async function(globals) {
  // Getting data from OpenWeatherMap and extract the relevant information.
  // https://openweathermap.org/current
  const host   = 'api.openweathermap.org';
  const uri    = '/data/2.5/weather';
  const cityId = `?id=${globals.config.location.cityId}`;
  const appId  = `&APPID=${globals.config.location.appId}`;

  const data = await request({
    json:     true,
    url:      `http://${host}${uri}${cityId}${appId}&lang=de&units=metric`,
    timeout:  2000, // 2 seconds
  });

  // Confirm validity of the result
  check.assert(check.all([
    check.assigned(_.get(data, ['clouds'])),  // cloudiness
    check.assigned(_.get(data, ['coord'])),   // geo location
    check.assigned(_.get(data, ['dt'])),      // time of data
    check.assigned(_.get(data, ['id'])),      // city id
    check.assigned(_.get(data, ['main'])),    // temperature/ pressure/ humidity
    check.assigned(_.get(data, ['name'])),    // city name
    check.maybe.assigned(_.get(data, ['rain'])),    // rain volume
    check.maybe.assigned(_.get(data, ['snow'])),    // snow volume
    check.assigned(_.get(data, ['weather'])), // weather https://openweathermap.org/weather-conditions
    check.assigned(_.get(data, ['wind'])),    // wind
  ]), `Incomplete weather data in ${JSON.stringify(data, null, 2)}`);
  check.assert.equal(data.name.trim(), globals.config.location.city,
    `Weather data city mismatch '${data.name}!==${globals.config.location.city}'`);
  check.assert.equal(data.id, globals.config.location.cityId,
    `Weather data id mismatch '${data.id}!==${globals.config.location.cityId}'`);
  // TODO I could also check if the weather data is outdated,
  // by checking the age of data.dt;

  const weather = _.isArray(data.weather) ? _.first(data.weather) : data.weather;

  return {
    sunrise:     moment.unix(data.sys.sunrise),
    sunset:      moment.unix(data.sys.sunset),
    cloudiness:  data.clouds.all,
    id:          weather.id,
    main:        weather.main,
    description: weather.description,
  };
};

const getNightDownTime = function(globals, weatherData, sunTimes, currentTime, lastDownTime) {
  let offsetMinutes;

  // https://openweathermap.org/weather-conditions
  switch(weatherData.main) {
    case  'Clear':
      offsetMinutes = -48;
      break;

    case  'Clouds':
      if(weatherData.cloudiness > 80) {
        offsetMinutes = -55;
      } else {
        offsetMinutes = -48;
      }
      break;

    case  'Atmosphere':
    case  'Drizzle':
    case  'Rain':
    case  'Snow':
    case  'Thunderstorm':
      offsetMinutes = -60;
      break;

    default:
      globals.log.error(`Unhandled weatherData ${JSON.stringify(weatherData, null, 2)}`);
      offsetMinutes = -60;
      break;
  }

  const dusk         = moment.utc(sunTimes.dusk).local();
  const nauticalDusk = moment.utc(sunTimes.nauticalDusk).local();
  const sunset       = moment.utc(sunTimes.sunset).local();
  let   newDownTime  = nauticalDusk.clone();

  newDownTime.add(offsetMinutes, 'minutes');

  if(!lastDownTime) {
    // The night down time had not been calculated yet.
    globals.log.info(`Night down time initial calculation:\n` +
      `                    sunset: ${sunset.format('HH:mm')}\n` +
      `                    dusk: ${dusk.format('HH:mm')}\n` +
      `                    nauticalDusk: ${nauticalDusk.format('HH:mm')}\n` +
      `                    weather: ${weatherData.main} ` +
                           `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                           `offset=${offsetMinutes}\n` +
      `                    downTime: ${newDownTime.format('HH:mm')}`);
  } else if(lastDownTime.format('HH:mm') !== newDownTime.format('HH:mm')) {
    // The night down time has changed.
    // Check if the changed night down time has already passed.
    if(newDownTime.isBefore(currentTime) &&
       currentTime.isBefore(lastDownTime)
    ) {
      globals.log.info(`New night down time has already passed -> TRIGGER NOW\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    nauticalDusk: ${nauticalDusk.format('HH:mm')}\n` +
        `                    weather: ${weatherData.main} ` +
                             `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${newDownTime.format('HH:mm')}`);

      newDownTime = currentTime;
    } else {
      globals.log.info(`Night down time update:\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    nauticalDusk: ${nauticalDusk.format('HH:mm')}\n` +
        `                    weather: ${weatherData.main} ` +
                             `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${newDownTime.format('HH:mm')}`);
    }
  }

  return newDownTime;
};



module.exports = {
  getData,
  getNightDownTime,
};
