#!/usr/bin/env node

'use strict';

/* eslint-disable no-lonely-if */

const fs          = require('fs');

const check       = require('check-types');
const delay       = require('delay');
const npid        = require('npid');
const moment      = require('moment');
const doWhile     = require('dank-do-while');
const fsExtra     = require('fs-extra');
const suncalc     = require('suncalc');

const Action      = require('./Action');
const buttons     = require('./buttons');
const configFile  = require('./configFile');
const dht22       = require('./dht22');
const logging     = require('./logging');
const rain        = require('./rain');
const rrdtool     = require('./rrdtool');
const signal      = require('./signal');
const status      = require('./status');
const sun         = require('./sun');
const vito        = require('./vito');
const weather     = require('./weather');
const wind        = require('./wind');
// const webServer   = require('./webServer');



// TODO Automatic vs manual. Impact on night down time and sun threshold.
// TODO I want an additional mode setting manual for the sun only,
//      and automatically switches to automatic on the night down time.
// TODO Reset the flags from last time on startup?
//      (Wind/ Sun/ Auto/Manual/ Night down)

// Location for sunTimes
const latitude  = 48.6207;
const longitude = 8.8988;

// *************************************************************************
// Globals

// variables I'm sharing into the modules
const globals = {
  config:         undefined,
  flagNight:      false,
  flagSun:        false,
  flagWindalarm:  false,
  mainLoopStatus: 'STARTUP',
  pi:             undefined,
};



// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNightAktiv    = false;
let momentanLeistung;
let temperatureOutside;
let sunThreshold;
let windThreshold;
let rainLevel;
let temperature;
let humidity;
let timerWind;
let timerSunDown;
let timerSunUp;
let weatherData;
let weatherRefreshedHour;
let nightDownTime;



const handleWeatherData = function(currentTime, data, sunTimes) {
  weatherData          = data;
  weatherRefreshedHour = currentTime.hour();
  nightDownTime        = weather.getNightDownTime(globals, data, sunTimes, currentTime, nightDownTime);
  status.update({
    weatherCode:        data.id,
    weatherMain:        data.main,
    weatherDescription: data.description,
    sunrise:            data.sunrise.format('HH:mm'),
    sunset:             data.sunset.format('HH:mm'),
    nightDownTime:      nightDownTime.format('HH:mm'),
  });
};



// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
const mainLoop = async function(next) {
  // globals.log.debug('Start main loop');

  try {
    // Zeit holen für spätere Bedingungen auf der Uhrzeit.
    const currentTime = moment();

    buttons.check();

    if(
      (currentTime.hour() !== weatherRefreshedHour &&
       currentTime.minute() === 10 &&
       currentTime.second() < 5
      ) ||
      nightDownTime === undefined ||
      weatherData === undefined
    ) {
  //        globals.log.debug('get weather');
      try {
        const newWeather = await weather.getData(globals);
        const sunTimes   = suncalc.getTimes(new Date(), latitude, longitude);

        handleWeatherData(currentTime, newWeather, sunTimes);
      } catch(err) {
        if(err.message !== 'No weather data') {
          globals.log.error('Failed to get weather data', err);
        }
      }
    }

    // DHT22
    // Get the room temperature and humidity from DHT22 sensor
    // only once per minute (at seconds === 30), since the sensor data
    // cannot be pulled every second.
    if(currentTime.second() === 30 || temperature === undefined) {
      try {
        // globals.log.debug('get dht22Data');

        const dht22Data = await dht22();

//        globals.log.debug('dht22Data', dht22Data);
//        globals.log.debug('dht22 data received');
        temperature = dht22Data.temperature;
        humidity    = dht22Data.humidity;

        status.update({
          temperature,
          humidity,
          dht22Timestamp:  moment().format('HH:mm:ss'),
        });
      } catch(err) {
        globals.log.info(`Failed to get data from DHT22. Error=${err.message}`);

        await delay(5000);
      }
    }

    // Write the current time into the status file
    status.update({time: currentTime.format('HH:mm:ss')});

    // Get the wind threshold
    try {
      // globals.log.debug('get windThreshold');

      const newWindThreshold = await wind.getThreshold(globals);

      windThreshold = newWindThreshold.threshold;

      status.update({windThreshold});
    } catch(err) {
      globals.log.error('Failed to get wind threshold', err);
    }

    // Get the rain amount
    try {
      // globals.log.debug('get getRain');

      const rainData = await rain.getRain(globals);

      rainLevel = rainData.rainLevel;

      if(rainLevel) {
        status.update({rainLevel});
      }
    } catch(err) {
      globals.log.error('Failed to get rain data', err);
    }

    // Get the sun threshold
    if(currentTime.second() % 2 === 0 || sunThreshold === undefined) {
      try {
        // globals.log.debug('sun.getThreshold');

        const newSunThreshold = await sun.getThreshold(globals);

//        globals.log.debug('sun.getThreshold ', newSunThreshold);
        sunThreshold = newSunThreshold.threshold;

        status.update({sunThreshold});
      } catch(err) {
        globals.log.error('Failed to get sun threshold', err);
      }
    }

    // Get the outside temperature from the Vito
    if(currentTime.second() === 10 || temperatureOutside === undefined) {
      try {
        // globals.log.debug('getVitoData');

        const vitoData = await vito.getTemperature();

        temperatureOutside = vitoData.temperatureOutside;

        status.update({temperatureOutside});
      } catch(err) {
        globals.log.error('Failed to get vito temperature', err);
      }
    }

    // Get the energy current power usage
    let stromFile = Buffer.from([]);
    let retries   = 5;

    try {
      // globals.log.debug('readStrom');

      do {
        stromFile = await fsExtra.readFile('/var/strom/strom.json');
        if(!stromFile.length) {
          retries--;
          await delay(50);
        }
      } while(!stromFile.length && retries);

      const strom = JSON.parse(stromFile);

      momentanLeistung = strom.momentanLeistung;

      status.update({momentanLeistung});
    } catch(err) {
      globals.log.error('Failed to get current power usage', {err: err.message, stromFile});
    }

    // Update values into rrd database
    if(temperature) {
      const rrdUpdates = {
        windThreshold,
        sunThreshold,
        temperatureDht:     temperature,
        humidity,
        temperatureOutside,
        flagSun:            globals.flagSun ? 1 : 0,
        flagWindalarm:      globals.flagWindalarm ? 1 : 0,
        flagNight:          globals.flagNight ? 1 : 0,
        rain:               rainLevel,
      };

      try {
        // globals.log.debug('update rrd', rrdUpdates);

        await rrdtool.update(rrdUpdates);
      } catch(err) {
        globals.log.error('rrdtool.update', {err, rrdUpdates});
      }
    }

    // Handle all the values
    if(!weatherData || !nightDownTime) {
      globals.log.info('No weather data yet. Skip further processing.');
    } else if(!temperature) {
      globals.log.info('No DHT data yet. Skip further processing.');
    } else {
      // so, jetzt habe ich die werte und kann darauf reagieren.
      if(globals.flagWindalarm) {
        // TODO im original gibt es noch die Bedingung
        // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
        // ohne Verzoegerung.
        if(windThreshold < globals.config.wind.up.threshold) {
          if(!timerWind) {
            globals.log.info(`Start timerWind\n` +
              `  windThreshold(${windThreshold}) < ` +
              `wind.up.threshold(${globals.config.wind.up.threshold})`);
            timerWind = moment.utc();
          } else if(moment.utc().diff(timerWind, 'minutes') >=
                      globals.config.wind.reset.delayMinutes
          ) {
            globals.log.info(`windThreshold(${windThreshold}) < ` +
              `wind.up.threshold(${globals.config.wind.up.threshold})`);
            globals.log.info(`timerWind >= ` +
              `wind.reset.delayMinutes(${globals.config.wind.reset.delayMinutes})`);
            globals.flagWindalarm = false;
            globals.log.info('flagWindalarm = false');
            timerWind = undefined;

            status.update({mode: 'zurueck'}); // TODO was war vorher? => normal

            // Alarm abschalten.
            globals.action.start('JALOUSIE_OFF');
            if(globals.flagNight) {
              // TODO will ich das wirklich? nachts die jalousien bewegen?
              //      vielleicht besser noch zeitlich einschraenken...

              // TODO
              // Jalousien wieder auf den vorigen Stand bringen
              //   - impuls runter
              //   - warten bis sicher unten
            } // flagNight
          }
        } else {
          if(timerWind) {
            globals.log.info(`Reset timerWind\n` +
              `  windThreshold(${windThreshold}) >= ` +
              `wind.up.threshold(${globals.config.wind.up.threshold})`);
            timerWind = undefined;
          }
        }
      } else { // !flagWindalarm
        if(windThreshold >= globals.config.wind.up.threshold) {
          globals.log.info(`windThreshold(${windThreshold}) >= ` +
            `wind.up.threshold(${globals.config.wind.up.threshold})`);
          globals.flagWindalarm = true;
          globals.log.info('flagWindalarm = true');
          status.update({mode: 'Windalarm'});

          // Wenn noch Sonne ist, gehen die Jalousien
          // ja bald wieder runter.
          globals.flagSun = false;
          timerSunDown = undefined;

          // To alarm, signal up and leave the level there.
          globals.action.start('JALOUSIE_UP_ON');
        } else { // !windThreshold >= config.wind.up.threshold
          if(currentTime.format('HH:mm') === globals.config.night.up) {
            // Night Up - in the morning
            if(!flagNightAktiv) { // Prevent triggering multiple times.
              flagNightAktiv = true;
              globals.flagNight = false;

              globals.log.info(`flagNight = false\n` +
                `night.up(${globals.config.night.up})`);

              // TODO das waere die stelle, mal zu pruefen, ob die jalousie
              // wegen sonne/temperatur gleich in schattenposition gehen sollte.
              globals.action.start('JALOUSIE_FULL_UP');
            }
          } else if(currentTime.format('HH:mm') === nightDownTime.format('HH:mm')) {
            // Night Runter - abends
            if(!flagNightAktiv) { // // Prevent triggering multiple times.
              flagNightAktiv = true;

              globals.log.info(`nightDownTime: ` +
                `${nightDownTime.format('HH:mm')}, ` +
                `(Sunset=${weatherData.sunset.format('HH:mm')}, ` +
                `wetterId=${weatherData.id} ${weatherData.main} ` +
                `${weatherData.description} ${weatherData.cloudiness}%)`);
              globals.flagNight = true;
              globals.log.info('flagNight = true');

              globals.action.start('JALOUSIE_FULL_DOWN');
            }
          } else { // !one of the night events
            flagNightAktiv = false;

            if(!globals.flagNight) { // not night
              if(globals.flagSun) {
                if(timerSunDown) {
                  globals.log.info(`Reset timerSunDown\n` +
                    `  sunThreshold(${sunThreshold}/` +
                         `${globals.config.sun.up.threshold})\n` +
                    `  temperature(${temperature.toFixed(1)}/` +
                         `${globals.config.sun.down.temp.degree})`);
                  timerSunDown = undefined;
                }

                if((sunThreshold < globals.config.sun.up.threshold) &&
                   (sunThreshold < globals.config.sun.down.temp.threshold ||
                    temperature < globals.config.sun.down.temp.degree)
                ) {
                  if(!timerSunUp) {
                    globals.log.info(`Start timerSunUp\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperature(${temperature.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunUp = moment.utc();
                  } else if(moment.utc().diff(timerSunUp, 'minutes') >=
                              globals.config.sun.up.delayMinutes
                  ) {
                    globals.log.info(`Trigger flagSun = false\n` +
                      `  timerSunUp >= ${globals.config.sun.up.delayMinutes}min`);
                    globals.flagSun = false;
                    timerSunUp = undefined;

                    globals.action.start('JALOUSIE_FULL_UP');
                  }
                } else {
                  if(timerSunUp) {
                    globals.log.info(`Reset timerSunUp\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperature(${temperature.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunUp = undefined;
                  }
                }
              } else { // !flagSun
                if(timerSunUp) {
                  globals.log.info(`Reset timerSunUp\n` +
                    `  sunThreshold(${sunThreshold}/` +
                         `${globals.config.sun.up.threshold})\n` +
                    `  temperature(${temperature.toFixed(1)}/` +
                         `${globals.config.sun.down.temp.degree})`);
                  timerSunUp = undefined;
                }

                if((sunThreshold >= globals.config.sun.down.threshold) ||
                   (sunThreshold >= globals.config.sun.down.temp.threshold &&
                    temperature >= globals.config.sun.down.temp.degree)
                ) {
                  if(!timerSunDown) {
                    globals.log.info(`Start timerSunDown\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperature(${temperature.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunDown = moment.utc();
                  } else if(moment.utc().diff(timerSunDown, 'minutes') >=
                              globals.config.sun.down.delayMinutes
                  ) {
                    globals.log.info(`Trigger flagSun = true\n` +
                      `  timerSunDown >= ${globals.config.sun.down.delayMinutes}min`);
                    globals.flagSun = true;
                    timerSunDown = undefined;

                    globals.action.start('JALOUSIE_SHADOW');
                  }
                } else { // !sunThreshold >= config.sun.down.threshold ||
                         // temperature >= globals.config.sun.down.temp.degree
                  // Timer zuruecksetzen
                  if(timerSunDown) {
                    globals.log.info(`Reset timerSunDown\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperature(${temperature.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunDown = undefined;
                  }
                } // !sunThreshold >= config.sun.down.threshold ||
                  // temperature >= globals.config.sun.down.temp.degree
              } // !flagSun
            } // not night
          } // !one of the night events && not night
        } // !windThreshold >= config.sun.up.threshold
      } // !flagWindalarm
    }

    // Update status
    status.update({
      flagNight:     globals.flagNight,
      flagSun:       globals.flagSun,
      flagWindalarm: globals.flagWindalarm,
    });

    // Check timers
    if(timerSunUp) {
      status.update({timerSunUp: moment.utc(moment.utc().diff(timerSunUp)).format('HH:mm:ss')});
    } else {
      status.update({timerSunUp: false});
    }
    if(timerSunDown) {
      status.update({timerSunDown: moment.utc(moment.utc().diff(timerSunDown)).format('HH:mm:ss')});
    } else {
      status.update({timerSunDown: false});
    }
    if(timerWind) {
      status.update({timerWind: moment.utc(moment.utc().diff(timerWind)).format('HH:mm:ss')});
    } else {
      status.update({timerWind: false});
    }

//    if(currentTime.second() === 0) {
//      globals.log.info('.');
//    }

    // Write status
    await status.write();

    if(currentTime.hour() === 23 && currentTime.minute() === 59 && currentTime.second() > 50) {
      globals.log.cleanLogTomorrow();
    }
  } catch(err) {
    /* eslint-disable no-console */
    console.error(err);
    /* eslint-enable no-console */
    globals.log.error(err);
  }

  if(['STARTUP', 'RUNNING'].includes(globals.mainLoopStatus)) {
    await delay(1000);

    return next(true);
  }

  return next(false);
};



// *************************************************************************
// main()
(async() => {
  const pidFile = '/var/run/jalousie.pid';

  // First there is the initialization, as a list of async tasks.
  try {
    // Read initial config
    const config = await configFile.read();

    check.assert.assigned(config, 'Failed to read configuration.');

    globals.config = config;

    globals.log = logging(globals);

    globals.log.info('-----------------------------------\n' +
      '                    Starting Jalousie with pigpio');

    // Register handler for uncaught exceptions and rejections.
    /* eslint-disable no-process-exit */
    process.on('uncaughtException', err => {
      globals.log.error(`Uncaught exception`, err);
      process.exit(10);
    });

    process.on('unhandledRejection', reason => {
      globals.log.error(`Unhandled rejection`, reason);
      process.exit(11);
    });
    /* eslint-enable no-process-exit */

    // Check if pid file exists.
    try {
      await fsExtra.access(pidFile, fs.constants.W_OK);

      globals.log.debug('pid file exists');

      const pid = await fsExtra.readJson(pidFile);

      try {
        process.kill(pid, 0);

        throw new Error(`Process still running with pid ${pid}`);
      } catch(errKill) {
        if(/Process still running/.test(errKill.message)) {
          throw errKill;
        }

        // Process does not exist
        globals.log.debug(`process with pid ${pid} does not exist`);

        await fsExtra.unlink(pidFile);

        globals.log.debug('pid file removed');
      }
    } catch(err) {
      if(/Process still running/.test(err.message)) {
        throw err;
      }

      // File does not exist, ok.
    }

    // Create a new pid file
    try {
      const pidFileHandle = npid.create(pidFile);

      pidFileHandle.removeOnExit();
    } catch(err) {
      globals.log.debug(`Failed to open ${pidFile}`);
    }

    globals.log.debug('pid file created');

    // Read and restore the last flags from the status file
    // TODO wie alt ist das flags file?
    const oldStatus = await status.read();

    globals.flagSun       = oldStatus.flagSun;
    globals.flagNight     = oldStatus.flagNight;
    globals.flagWindalarm = oldStatus.flagWindalarm;
    status.update(oldStatus);

    // Initialize process status.xml file
    status.update({process: 'startup', mode: 'normal'});
    await status.write();

    // Read initial weather
    globals.log.debug('get weather');

    try {
      const data     = await weather.getData(globals);
      const sunTimes = suncalc.getTimes(new Date(), latitude, longitude);

      handleWeatherData(moment(), data, sunTimes);
    } catch(err) {
      // ignore
    }

// TODO    // Start web server
// TODO    globals.log.debug('start web server');
// TODO    webServer.startup(globals);

    // Set the jalousie outputs to the initial state.
    globals.action = new Action(globals);

    globals.log.info('Init: JALOUSIE_OFF');
    await globals.action.start('JALOUSIE_OFF');

    // Set wind sensor to generate an interrupt on high-to-low transitions.
    wind.init(globals);

    // Set rain sensor to generate an interrupt on high-to-low transitions.
    rain.init(globals);

    // Set buttons to trigger actions.
    buttons.init(globals);

    // Initialize the signal handler to properly cleanup on shutdown.
    signal.installCleanupOnStop(globals);

    // Initialize process flags and write into the status.xml file
    globals.log.debug('init flags and status');
    status.update({process: 'running', mode: 'normal'});
    await status.write();

    globals.log.debug('start main loop');
    doWhile(next => {
      mainLoop(next);
    }, () => {
      globals.mainLoopStatus = 'STOPPED';
      globals.log.info('Terminated mainLoop');
    });
  } catch(err) {
    /* eslint-disable no-console */
    console.error(err);
    /* eslint-enable no-console */
    globals.log.error(err);

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }
})();
