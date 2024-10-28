import dayjs    from 'dayjs';
import {logger} from '@stheine/helpers';
import utc      from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// https://openweathermap.org/api/one-call-api

let lastDownTime;

export default function calcNightDownTime(data, sunTimes) {
  const currentTime = dayjs();
  let   offsetMinutes;

  // https://openweathermap.org/weather-conditions
  switch(data.current.weather[0].main) {
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
      if(data.current.clouds > 80) {
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
      `                    weather: ${data.current.weather[0].main} ` +
                           `(${data.current.weather[0].description}, ${data.current.clouds}%), ` +
                           `offset=${offsetMinutes}\n` +
      `                    downTime: ${downTime.format('HH:mm')}`);
  } else if(lastDownTime.format('HH:mm') !== downTime.format('HH:mm')) {
    // The night down time has changed.
    // Check if the changed night down time has already passed.
    if(downTime.isBefore(currentTime) &&
       currentTime.isBefore(lastDownTime)
    ) {
      downTime = currentTime.add(1, 'minutes');

      logger.info(`Weather: New night down time has already passed -> TRIGGER NOW\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${data.current.weather[0].main} ` +
                             `(${data.current.weather[0].description}, ${data.current.clouds}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${downTime.format('HH:mm')}`);
    } else {
      logger.info(`Weather: Night down time update:\n` +
        `                    sunset: ${sunset.format('HH:mm')}\n` +
        `                    dusk: ${dusk.format('HH:mm')}\n` +
        `                    weather: ${data.current.weather[0].main} ` +
                             `(${data.current.weather[0].description}, ${data.current.clouds}%), ` +
                             `offset=${offsetMinutes}\n` +
        `                    downTime: ${downTime.format('HH:mm')}`);
    }
  }

  lastDownTime = downTime;

  return downTime;
};
