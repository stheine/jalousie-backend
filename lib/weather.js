'use strict';

const _                = require('lodash');
const check            = require('check-types-2');
const dayjs            = require('dayjs');
const millisecond      = require('millisecond');
const needle           = require('needle');
const resultsOfAllKeys = require('promise-results/allKeys');
const suncalc          = require('suncalc');
const utc              = require('dayjs/plugin/utc');

const logger           = require('./logger');

dayjs.extend(utc);

// https://openweathermap.org/current
// https://openweathermap.org/forecast5

let lastNightDownTime;

const getData = async function({openWeatherLocation}) {
  // Getting data from OpenWeatherMap and extract the relevant information.
  // https://openweathermap.org/current
  const host   = 'api.openweathermap.org';
  const base   = '/data/2.5';
  const cityId = `&id=${openWeatherLocation.cityId}`;
  const appId  = `&APPID=${openWeatherLocation.appId}`;

  const results = await resultsOfAllKeys({
    current: (async() => {
      const resultRaw = await needle(
        'get',
        `http://${host}${base}/weather?${cityId}${appId}&lang=de&units=metric`,
        null,
        {
          json:    true,
          timeout: millisecond('2 seconds'),
        }
      );
      const result = resultRaw.body;

      // logger.debug('current', result);

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
      check.assert.equal(result.name.trim(), openWeatherLocation.city,
        `Weather result city mismatch '${result.name}!==${openWeatherLocation.city}'`);
      check.assert.equal(result.id, openWeatherLocation.cityId,
        `Weather result id mismatch '${result.id}!==${openWeatherLocation.cityId}'`);
      // TODO I could also check if the weather result is outdated,
      // by checking the age of result.dt;

      result.weather = _.isArray(result.weather) ? _.first(result.weather) : result.weather;

      return result;
    })(),
    forecast: (async() => {
      const resultRaw = await needle(
        'get',
        `http://${host}${base}/forecast?${cityId}${appId}&lang=de&units=metric`,
        null,
        {
          json:    true,
          timeout: millisecond('2 seconds'),
        }
      );
      const result = resultRaw.body;

      // logger.debug('forecast', result);

      // Confirm validity of the result
      check.assert(check.all([
        check.equal(Number(_.get(result, 'cod')), 200),           // Status
        check.array(_.get(result, 'list')),               // Forecast list
        check.object(_.get(result, 'list.0')),            // Forecast list entry
        check.object(_.get(result, 'list.0.main')),       // Forecast, main
        check.array(_.get(result, 'list.0.weather')),     // Forecast, weather
        check.object(_.get(result, 'list.0.clouds')),     // Forecast, clouds
        check.object(_.get(result, 'list.0.wind')),       // Forecast, wind
        check.maybe.object(_.get(result, 'list.0.rain')), // Forecast, rain
        check.maybe.object(_.get(result, 'list.0.snow')), // Forecast, snow
      ]), `Incomplete forecast result in ${JSON.stringify(result, null, 2)}`);
      check.assert.equal(result.city.name.trim(), openWeatherLocation.city,
        `Forecast result city mismatch '${result.name}!==${openWeatherLocation.city}'`);
      check.assert.equal(result.city.id, openWeatherLocation.cityId,
        `Forecast result id mismatch '${result.id}!==${openWeatherLocation.cityId}'`);
      // TODO I could also check if the forecast result is outdated,
      // by checking the age of result.dt;

      return _.slice(result.list, 0, 4);
    })(),
  });

  const {current, forecast} = results;

  return {
    sunrise:         dayjs(current.sys.sunrise),
    sunset:          dayjs(current.sys.sunset),
    cloudiness:      current.clouds.all,
    id:              current.weather.id,
    main:            current.weather.main,
    description:     current.weather.description,
    forecast,
    forecastMaxWind: _.max(_.map(forecast, entry => entry.wind.speed)),
  };
};

const calcNightDownTime = function(weatherData, sunTimes, currentTime) {
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
      logger.error(`Unhandled weatherData ${JSON.stringify(weatherData, null, 2)}`);
      offsetMinutes = 0;
      break;
  }

  const dusk   = dayjs.utc(sunTimes.dusk).local();
  const sunset = dayjs.utc(sunTimes.sunset).local();
  const duration = dusk - sunset;
  let   newDownTime = sunset.clone().add(duration * 0.7);

  newDownTime.add(offsetMinutes, 'minutes');

  if(!lastNightDownTime) {
    // The night down time had not been calculated yet.
    logger.info(`Night down time initial calculation:\n` +
      `                    sunset: ${sunset.format('HH:mm')}\n` +
      `                    dusk: ${dusk.format('HH:mm')}\n` +
      `                    weather: ${weatherData.main} ` +
                           `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                           `offset=${offsetMinutes}\n` +
      `                    downTime: ${newDownTime.format('HH:mm')}`);
  } else if(lastNightDownTime.format('HH:mm') !== newDownTime.format('HH:mm')) {
    // The night down time has changed.
    // Check if the changed night down time has already passed.
    if(newDownTime.isBefore(currentTime) &&
       currentTime.isBefore(lastNightDownTime)
    ) {
      logger.info(`New night down time has already passed -> TRIGGER NOW\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${weatherData.main} ` +
                             `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${newDownTime.format('HH:mm')}`);

      newDownTime = currentTime;
    } else {
      logger.info(`Night down time update:\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${weatherData.main} ` +
                             `(${weatherData.description}, ${weatherData.cloudiness}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${newDownTime.format('HH:mm')}`);
    }
  }

  lastNightDownTime = newDownTime;

  return newDownTime;
};

const getNightDownTime = async function({openWeatherLocation, suncalcLocation}) {
  check.assert.object(openWeatherLocation, 'openWeatherLocation missing');
  check.assert.object(suncalcLocation, 'suncalcLocation missing');

  // logger.debug('Get weather');

  const weatherData = await getData({openWeatherLocation});

  // logger.debug({weatherData});

  const currentTime = dayjs();
  const sunTimes = suncalc.getTimes(new Date(), suncalcLocation.latitude, suncalcLocation.longitude);

  // TODO forecastMaxWind      = weatherData.forecastMaxWind;
  const nightDownTime = calcNightDownTime(weatherData, sunTimes, currentTime);

  return nightDownTime;
};

module.exports = {
  getData,
  getNightDownTime,
};
