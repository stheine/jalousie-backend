'use strict';

const _                = require('lodash');
const check            = require('check-types');
const moment           = require('moment');
const request          = require('request-promise-native');
const resultsOfAllKeys = require('promise-results/allKeys');

// https://openweathermap.org/current
// https://openweathermap.org/forecast5

const getData = async function(params) {
  // Getting data from OpenWeatherMap and extract the relevant information.
  // https://openweathermap.org/current
  const host   = 'api.openweathermap.org';
  const base   = '/data/2.5';
  const cityId = `&id=${params.config.openWeatherLocation.cityId}`;
  const appId  = `&APPID=${params.config.openWeatherLocation.appId}`;

  const results = await resultsOfAllKeys({
    current: (async() => {
      const result = await request({
        json:     true,
        url:      `http://${host}${base}/weather?${cityId}${appId}&lang=de&units=metric`,
        timeout:  2000, // 2 seconds
      });

      // Confirm validity of the result
      check.assert(check.all([
        check.equal(_.get(result, 'cod'), 200),     // Status
        check.assigned(_.get(result, 'clouds')),  // cloudiness
        check.assigned(_.get(result, 'coord')),   // geo location
        check.assigned(_.get(result, 'dt')),      // time of result
        check.assigned(_.get(result, 'id')),      // city id
        check.assigned(_.get(result, 'main')),    // temperature/ pressure/ humidity
        check.assigned(_.get(result, 'name')),    // city name
        check.maybe.assigned(_.get(result, 'rain')),    // rain volume
        check.maybe.assigned(_.get(result, 'snow')),    // snow volume
        check.assigned(_.get(result, 'weather')), // weather https://openweathermap.org/weather-conditions
        check.assigned(_.get(result, 'wind')),    // wind
      ]), `Incomplete weather result in ${JSON.stringify(result, null, 2)}`);
      check.assert.equal(result.name.trim(), params.config.openWeatherLocation.city,
        `Weather result city mismatch '${result.name}!==${params.config.openWeatherLocation.city}'`);
      check.assert.equal(result.id, params.config.openWeatherLocation.cityId,
        `Weather result id mismatch '${result.id}!==${params.config.openWeatherLocation.cityId}'`);
      // TODO I could also check if the weather result is outdated,
      // by checking the age of result.dt;

      result.weather = _.isArray(result.weather) ? _.first(result.weather) : result.weather;

      return result;
    })(),
    forecast: (async() => {
      const result = await request({
        json:     true,
        url:      `http://${host}${base}/forecast?${cityId}${appId}&lang=de&units=metric`,
        timeout:  2000, // 2 seconds
      });

      // Confirm validity of the result
      check.assert(check.all([
//        check.equal(_.get(result, 'cod'), 200),           // Status
//        check.array(_.get(result, 'list')),               // Forecast list
//        check.object(_.get(result, 'list.0')),            // Forecast list entry
//        check.object(_.get(result, 'list.0.main')),       // Forecast, main
//        check.array(_.get(result, 'list.0.weather')),     // Forecast, weather
//        check.object(_.get(result, 'list.0.clouds')),     // Forecast, clouds
//        check.object(_.get(result, 'list.0.wind')),       // Forecast, wind
//        check.maybe.object(_.get(result, 'list.0.rain')), // Forecast, rain
//        check.maybe.object(_.get(result, 'list.0.snow')), // Forecast, snow
//        check.assigned(_.get(result, 'dt')),              // Forecast time
      ]), `Incomplete forecast result in ${JSON.stringify(result, null, 2)}`);
      check.assert.equal(result.city.name.trim(), params.config.openWeatherLocation.city,
        `Forecast result city mismatch '${result.name}!==${params.config.openWeatherLocation.city}'`);
      check.assert.equal(result.city.id, params.config.openWeatherLocation.cityId,
        `Forecast result id mismatch '${result.id}!==${params.config.openWeatherLocation.cityId}'`);
      // TODO I could also check if the forecast result is outdated,
      // by checking the age of result.dt;

      return _.slice(result.list, 0, 4);
    })(),
  });

  const {current, forecast} = results;

  return {
    sunrise:         moment.unix(current.sys.sunrise),
    sunset:          moment.unix(current.sys.sunset),
    cloudiness:      current.clouds.all,
    id:              current.weather.id,
    main:            current.weather.main,
    description:     current.weather.description,
    forecast,
    forecastMaxWind: _.max(_.map(forecast, entry => entry.wind.speed)),
  };
};

const getNightDownTime = function(params, weatherData, sunTimes, currentTime, lastDownTime) {
  let offsetMinutes;

  // https://openweathermap.org/weather-conditions
  switch(weatherData.main) {
    case  'Clear':
      offsetMinutes = 0;
      break;

    case  'Clouds':
      if(weatherData.cloudiness > 80) {
        offsetMinutes = -7;
      } else {
        offsetMinutes = 0;
      }
      break;

    case  'Atmosphere':
    case  'Drizzle':
    case  'Fog':
    case  'Rain':
    case  'Snow':
    case  'Thunderstorm':
      offsetMinutes = -12;
      break;

    default:
      params.log.error(`Unhandled weatherData ${JSON.stringify(weatherData, null, 2)}`);
      offsetMinutes = 0;
      break;
  }

  const dusk   = moment.utc(sunTimes.dusk).local();
  const sunset = moment.utc(sunTimes.sunset).local();
  const duration = dusk - sunset;
  let   newDownTime = sunset.clone().add(duration * 0.7);

  newDownTime.add(offsetMinutes, 'minutes');

  if(!lastDownTime) {
    // The night down time had not been calculated yet.
    params.log.info(`Night down time initial calculation:\n` +
      `                    sunset: ${sunset.format('HH:mm')}\n` +
      `                    dusk: ${dusk.format('HH:mm')}\n` +
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
      params.log.info(`New night down time has already passed -> TRIGGER NOW\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${weatherData.main} ` +
                             `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${newDownTime.format('HH:mm')}`);

      newDownTime = currentTime;
    } else {
      params.log.info(`Night down time update:\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
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
