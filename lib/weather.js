'use strict';

/* eslint-disable complexity */

const http   = require('http');

// http://momentjs.com/docs
const moment = require('moment');



const getData = function(globals) {
  // Getting weather data from Yahoo and extract the relevant information.
  // https://developer.yahoo.com/weather/documentation.html
  return new Promise((resolveGetData, reject) => {
    const host  = 'query.yahooapis.com';
    const uri   = '/v1/public/yql';
    const query =
      `select ` +
        `* ` +
      `from ` +
        `weather.forecast ` +
      `where ` +
        `woeid in ` +
          `( ` +
            `select ` +
              `woeid ` +
            `from ` +
              `geo.places(1) ` +
            `where ` +
              `text='${globals.config.location.city}, ` +
                `${globals.config.location.region}, ` +
                `${globals.config.location.country}' ` +
          `) ` +
      `and ` +
        `u = 'c'`;

    http.get({
      hostname: host,
      port:     80,
      path:     `${uri}?q=${encodeURI(query)}&format=json`
    }, res => {
      new Promise(resolveHttpGet => {
        const chunks = [];

        res.on('data', chunk => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolveHttpGet(chunks.join(''));
        });
      }).then(body => {
        let weather;

        try {
          weather = JSON.parse(body);
        } catch(errJson) {
          return reject(errJson);
        }

        // Confirm validity of the result
        if(weather.query.results.channel.location.city.trim()
             !== globals.config.location.city
        ) {
          return reject(new Error(`Weather data city mismatch ` +
            `'${weather.query.results.channel.location.city}` +
            `!==${globals.config.location.city}'`));
        }
        if(weather.query.results.channel.location.country.trim()
             !== globals.config.location.country
        ) {
          return reject(new Error(`Weather data country mismatch ` +
            `'${weather.query.results.channel.location.country}` +
            `!==${globals.config.location.country}'`));
        }
        if(weather.query.results.channel.location.region.trim()
             !== globals.config.location.region
        ) {
          return reject(new Error(`Weather data region mismatch ` +
            `'${weather.query.results.channel.location.region}` +
            `!==${globals.config.location.region}'`));
        }
        // TODO I could also check if the weather data is outdated,
        // by checking the age of
        // weather.query.results.channel.item.condition.date);

        return resolveGetData({
          sunrise: moment(
            weather.query.results.channel.astronomy.sunrise, 'h:m a'),
          sunset:  moment(
            weather.query.results.channel.astronomy.sunset,  'h:m a'),
          code:    weather.query.results.channel.item.condition.code,
          text:    weather.query.results.channel.item.condition.text
        });
      });
    }).on('error', errHttp => reject(errHttp));
  });
};



const getNightDownTime = function(globals, weatherData, currentTime, lastDownTime) {
  let offsetMinutes;

  // https://developer.yahoo.com/weather/documentation.html#codes
  switch(parseInt(weatherData.code, 10)) {
    case  0: // tornado
    case  1: // tropical storm
    case  2: // hurricane
    case  3: // severe thunderstorms
    case  4: // thunderstorms
    case  5: // mixed rain and snow
    case  6: // mixed rain and sleet
    case  7: // mixed snow and sleet
    case  8: // freezing drizzle
    case  9: // drizzle
    case 10: // freezing rain
    case 13: // snow flurries
    case 14: // light snow showers
    case 15: // blowing snow
    case 16: // snow
    case 17: // hail
    case 18: // sleet
    case 19: // dust
    case 20: // foggy
    case 21: // haze
    case 22: // smoky
    case 23: // blustery
    case 35: // mixed rain and hail
    case 36: // hot
    case 37: // isolated thunderstorms
    case 38: // scattered thunderstorms
    case 40: // scattered showers
    case 41: // heavy snow
    case 42: // scattered snow showers
    case 43: // heavy snow
    case 44: // partly cloudy
    case 45: // thundershowers
    case 46: // snow showers
    case 47: // isolated thundershowers
      offsetMinutes = 0;
      break;

    case 11: // showers
    case 12: // showers
    case 39: // scattered showers / scattered thunderstorms
      offsetMinutes = 18;
      break;

    case 24: // windy
    case 25: // cold
    case 26: // cloudy
    case 27: // mostly cloudy (night)
    case 28: // mostly cloudy (day)
    case 29: // partly cloudy (night)
    case 30: // partly cloudy (day)
      offsetMinutes = 23;
      break;

    case 31: // clear (night)
    case 32: // sunny
    case 33: // fair (night)
    case 34: // fair (day)
      offsetMinutes = 30;
      break;

    default:
      globals.log.error(`Unhandled weatherData.code=${weatherData.code}`);
      offsetMinutes = 0;
      break;
  }

  let newDownTime = weatherData.sunset.clone();

  newDownTime.add(offsetMinutes, 'minutes');

  if(!lastDownTime) {
    // Die night down time had not been calculated yet.
    globals.log.info(`Night down time initial calculation:\n` +
      `               sunset: ${weatherData.sunset.format('HH:mm')}\n` +
      `               code: ${weatherData.code} (${weatherData.text}), ` +
                       `offset=${offsetMinutes}\n` +
      `               downTime: ${newDownTime.format('HH:mm')}`);
  } else if(lastDownTime.format('HH:mm') !== newDownTime.format('HH:mm')) {
    // The night down time has changed.
    // Check if the changed night down time has already passed.
    if(newDownTime.isBefore(currentTime) &&
       currentTime.isBefore(lastDownTime)
    ) {
      globals.log.info(`New night down time has already passed -> TRIGGER NOW\n` +
        `  sunset: ${weatherData.sunset.format('HH:mm')}\n` +
        `  code: ${weatherData.code} (${weatherData.text}), ` +
            `offset=${offsetMinutes}\n` +
        `  downTime: ${newDownTime.format('HH:mm')}`);

      newDownTime = currentTime;
    } else {
      globals.log.info(`Night down time update:\n` +
        `  sunset: ${weatherData.sunset.format('HH:mm')}\n` +
        `  code: ${weatherData.code} (${weatherData.text}), ` +
            `offset=${offsetMinutes}\n` +
        `  downTime: ${newDownTime.format('HH:mm')}`);
    }
  }

  return newDownTime;
};



module.exports = {
  getData,
  getNightDownTime
};
