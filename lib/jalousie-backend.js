#!/usr/bin/env node

'use strict';

/* eslint-disable no-lonely-if */

// const _           = require('lodash');
const check       = require('check-types-2');
const dayjs       = require('dayjs');
const mqtt        = require('async-mqtt');
const millisecond = require('millisecond');
const utc         = require('dayjs/plugin/utc');

const configFile  = require('./configFile');
const logger      = require('./logger');
const signal      = require('./signal');
const status      = require('./status');
const weather     = require('./weather');

dayjs.extend(utc);

// *************************************************************************
// Globals

// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNight;
let flagNightAktiv        = false;
let flagSun;
let forecast2MaxClouds    = null;
let forecast2MaxTemp      = null;
let forecast10MaxWind     = null;
let forecast10MinTemp     = null;
let humidity;
let nightDownTime;
let nightForcastHandled   = null;
let sunLevel;
let temperature;
let timerSunDown          = null;
let timerSunUp            = null;

const mainLoop = async function({config, mqttClient}) {
  try {
    // Zeit holen für spätere Bedingungen auf der Uhrzeit.
    const currentTime = dayjs();

    // Write the current time into the status file
    status.update({time: currentTime.format('HH:mm:ss')});

    // Publish the data
    await mqttClient.publish('Jalousie/tele/SENSOR', JSON.stringify({
      flagNight: flagNight ? 1 : 0,
      flagSun:   flagSun   ? 1 : 0,
    }), {retain: true});

    // Handle all the values
    if(!nightDownTime) {
      logger.info('No weather data yet. Skip further processing.');
    } else if(!temperature) {
      logger.info('No temperature data yet. Skip further processing.');
    } else {
      // so, jetzt habe ich die werte und kann darauf reagieren.
      if(currentTime.format('HH:mm') === config.night.windCheck.time &&
        nightForcastHandled !== currentTime.format('MM-DD')
      ) {
        nightForcastHandled = currentTime.format('MM-DD');

        if(forecast10MaxWind > config.night.windCheck.limit) {
          logger.info(`forecast10MaxWind(${forecast10MaxWind}) > limit(${config.night.windCheck.limit})`);

          // TODO mqttClient.publish('Jalousie/cmnd/full_up', JSON.stringify({}));
        }

        logger.info('TODO check jalousie hoch wegen wind heute nacht?',
          {forecast10MaxWind, forecast10MinTemp});
      }

      if(currentTime.format('HH:mm') === config.night.up) {
        // Night Up - in the morning
        if(!flagNightAktiv) { // Prevent triggering multiple times.
          flagNightAktiv = true;
          flagNight = false;

          if(forecast2MaxTemp > 20) {
            logger.info(`flagNight = false\n` +
              `                    forecast2MaxTemp(${forecast2MaxTemp}) => flagSun = true`);
            flagSun = true;
            mqttClient.publish('Jalousie/cmnd/turn', JSON.stringify({}));
          } else {
            logger.info(`flagNight = false\n` +
              `                    night.up(${config.night.up})`);

            // TODO das waere die stelle, mal zu pruefen, ob die jalousie
            // wegen sonne/temperatur gleich in schattenposition gehen sollte.
            mqttClient.publish('Jalousie/cmnd/full_up', JSON.stringify({}));
          }
        }
      } else if(currentTime.format('HH:mm') === nightDownTime.format('HH:mm')) {
        // Night Runter - abends
        if(!flagNightAktiv) { // // Prevent triggering multiple times.
          flagNightAktiv = true;

          logger.info(`nightDownTime: ${nightDownTime.format('HH:mm')}`);
          flagNight = true;
          logger.info('flagNight = true');

          mqttClient.publish('Jalousie/cmnd/full_down', JSON.stringify({}));
        }
      } else { // !one of the night events
        flagNightAktiv = false;

        if(!flagNight) { // not night
          if(flagSun) {
            if(timerSunDown) {
              logger.info(`Reset timerSunDown\n` +
                `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                `  temperature(${temperature}/${config.sun.down.temp.degree})`);
              timerSunDown = null;
            }

            if((sunLevel < config.sun.up.threshold) &&
               (sunLevel < config.sun.down.temp.threshold ||
                temperature < config.sun.down.temp.degree) &&
               (forecast2MaxTemp <= 20 ||
                currentTime.format('HH:mm') > '16:00')
            ) {
              if(!timerSunUp) {
                logger.info(`Start timerSunUp\n` +
                  `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                  `  temperature(${temperature}/${config.sun.down.temp.degree})`);
                timerSunUp = dayjs.utc();
              } else if(dayjs.utc().diff(timerSunUp, 'minutes') >=
                          config.sun.up.delayMinutes
              ) {
                logger.info(`Trigger flagSun = false\n` +
                  `  timerSunUp >= ${config.sun.up.delayMinutes}min`);
                flagSun = false;
                timerSunUp = null;

                mqttClient.publish('Jalousie/cmnd/full_up', JSON.stringify({}));
              }
            } else {
              if(timerSunUp) {
                logger.info(`Reset timerSunUp\n` +
                  `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                  `  temperature(${temperature}/${config.sun.down.temp.degree})`);
                timerSunUp = null;
              }
            }
          } else { // !flagSun
            if(timerSunUp) {
              logger.info(`Reset timerSunUp\n` +
                `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                `  temperature(${temperature}/${config.sun.down.temp.degree})`);
              timerSunUp = null;
            }

            if((sunLevel >= config.sun.down.threshold) ||
               (sunLevel >= config.sun.down.temp.threshold &&
                temperature >= config.sun.down.temp.degree)
            ) {
              if(!timerSunDown) {
                logger.info(`Start timerSunDown\n` +
                  `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                  `  temperature(${temperature}/${config.sun.down.temp.degree})`);
                timerSunDown = dayjs.utc();
              } else if(dayjs.utc().diff(timerSunDown, 'minutes') >=
                          config.sun.down.delayMinutes
              ) {
                logger.info(`Trigger flagSun = true\n` +
                  `  timerSunDown >= ${config.sun.down.delayMinutes}min`);
                flagSun = true;
                timerSunDown = null;

                mqttClient.publish('Jalousie/cmnd/shadow', JSON.stringify({}));
              }
            } else { // !sunLevel >= config.sun.down.threshold ||
                     // temperature >= config.sun.down.temp.degree
              // Timer zuruecksetzen
              if(timerSunDown) {
                logger.info(`Reset timerSunDown\n` +
                  `  sunLevel(${sunLevel}/${config.sun.up.threshold})\n` +
                  `  temperature(${temperature}/${config.sun.down.temp.degree})`);
                timerSunDown = null;
              }
            } // !sunLevel >= config.sun.down.threshold ||
              // temperature >= config.sun.down.temp.degree
          } // !flagSun
        } // not night
      } // !one of the night events && not night
    }

    // Update status
    status.update({flagNight, flagSun});

    // Check timers
    if(timerSunUp) {
      status.update({timerSunUp: dayjs.utc(dayjs.utc().diff(timerSunUp)).format('HH:mm:ss')});
    } else {
      status.update({timerSunUp});
    }
    if(timerSunDown) {
      status.update({timerSunDown: dayjs.utc(dayjs.utc().diff(timerSunDown)).format('HH:mm:ss')});
    } else {
      status.update({timerSunDown});
    }

    // Write status
    await status.write();
  } catch(err) {
    logger.error(err);
  }
};

// *************************************************************************
// main()
(async() => {
  logger.info('-----------------------------------\n' +
    '                    Starting jalousie-backend');

  // First there is the initialization, as a list of async tasks.
  try {
    // Read initial config
    const config = await configFile.read();

    check.assert.assigned(config, 'Failed to read configuration.');

    // Read and restore the last flags from the status file
    const oldStatus = await status.read();

    flagSun       = oldStatus.flagSun;
    flagNight     = oldStatus.flagNight;
    status.update(oldStatus);

    // Initialize process status.xml file
    status.update({process: 'startup', mode: 'normal'});
    await status.write();

    // Init MQTT connection
    const mqttClient = await mqtt.connectAsync('tcp://192.168.6.7:1883');

    mqttClient.on('message', async(topic, messageBuffer) => {
      try {
        const message = JSON.parse(messageBuffer.toString());

        switch(topic) {
          case 'Sonne/tele/SENSOR':
            sunLevel = message.level;

            status.update({sunLevel});
            break;

          case 'Wohnzimmer/tele/SENSOR':
            temperature = message.temperature;
            humidity    = message.humidity;
            status.update({temperature, humidity});
            break;

          default:
            logger.error(`Unhandled topic '${topic}'`, message);
            break;
        }
      } catch(err) {
        logger.error(`Failed to parse mqtt message for '${topic}': ${messageBuffer.toString()}`, err);
      }
    });

    await mqttClient.subscribe('Sonne/tele/SENSOR');
    await mqttClient.subscribe('Wohnzimmer/tele/SENSOR');

    // Initialize process flags and write into the status.xml file
    status.update({process: 'running', mode: 'normal'});
    await status.write();

    // Init weather interval
    const weatherInterval = setInterval(async() => {
      ({forecast2MaxClouds, forecast2MaxTemp, forecast10MaxWind, forecast10MinTemp, nightDownTime} = await weather.get({
        openWeatherLocation: config.openWeatherLocation,
        suncalcLocation:     config.suncalcLocation,
      }));
    }, millisecond('1 hour'));

    ({forecast2MaxClouds, forecast2MaxTemp, forecast10MaxWind, forecast10MinTemp, nightDownTime} = await weather.get({
      openWeatherLocation: config.openWeatherLocation,
      suncalcLocation:     config.suncalcLocation,
    }));

    // Init mainLoop interval
    logger.debug('Start main loop');

    const mainLoopInterval = setInterval(async() => {
      await mainLoop({config, mqttClient});
    }, millisecond('5 seconds'));

    await mainLoop({config, mqttClient});

    // Initialize the signal handler to properly cleanup on shutdown.
    signal.installCleanupOnStop({mainLoopInterval, mqttClient, weatherInterval});
  } catch(err) {
    /* eslint-disable no-console */
    console.error(err);
    /* eslint-enable no-console */
    logger.error(err);

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }
})();
