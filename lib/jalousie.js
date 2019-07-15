#!/usr/bin/env node

'use strict';

const fs            = require('fs');

const _             = require('lodash');
const check         = require('check-types');
const delay         = require('delay');
const npid          = require('npid');
const rrdtool       = require('rrdtools');
const moment        = require('moment');
const doWhile       = require('dank-do-while');
const fsExtra       = require('fs-extra');
const {promisify}   = require('es6-promisify');
const rrdtoolUpdate = promisify(rrdtool.update);
const pigpiod       = require('@stheine/pigpiod');
const suncalc       = require('suncalc');

const configFile = require('./configFile');
const signal     = require('./signal');
const wind       = require('./wind');
const rain       = require('./rain');
const sun        = require('./sun');
const vito       = require('./vito');
const weather    = require('./weather');
const status     = require('./status');
const action     = require('./action');
const webServer  = require('./webServer');
const logging    = require('./logging');
const buttons    = require('./buttons');



// TODO Automatic vs manual. Impact on night down time and sun threshold.
// TODO I want an additional mode setting manual for the sun only,
//      and automatically switches to automatic on the night down time.
// TODO Reset the flags from last time on startup?
//      (Wind/ Sun/ Auto/Manual/ Night down)

const MCP3204_SPI_CHANNEL  =  0; // MCP3204 is connected to SPI channel #0

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
// let temperatureKty;
let temperatureDht;
let humidity;
let timerWind;
let timerSunDown;
let timerSunUp;
let weatherData;
let weatherCode;
let weatherRefreshedHour;
let nightDownTime;



const handleWeatherData = function(currentTime, dataWeather, sunTimes) {
  weatherData          = dataWeather;
  weatherCode          = dataWeather.code;
  weatherRefreshedHour = currentTime.hour();
  nightDownTime        = weather.getNightDownTime(globals, dataWeather, sunTimes, currentTime, nightDownTime);
  status.update({
    weatherCode:        dataWeather.id,
    weatherMain:        dataWeather.main,
    weatherDescription: dataWeather.description,
    sunrise:            dataWeather.sunrise.format('HH:mm'),
    sunset:             dataWeather.sunset.format('HH:mm'),
    nightDownTime:      nightDownTime.format('HH:mm'),
  });
};


// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
const mainLoop = async function(next) {
//  globals.log.debug('Start main loop');

  try {
    // Zeit holen für spätere Bedingungen auf der Uhrzeit.
    const currentTime = moment();

    buttons.check();

    if((currentTime.hour() !== weatherRefreshedHour &&
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
    if(currentTime.second() === 30 || temperatureDht === undefined) {
  //        globals.log.debug('get dht22Data');
      const dht22Data = pigpiod.dht22(globals.pi, 18);

  //        globals.log.debug('dht22Data', dht22Data);
      if(dht22Data.status === pigpiod.DHT_GOOD) {
  //          globals.log.debug('dht22 data received');
        temperatureDht = parseFloat(dht22Data.temperature);
        humidity       = parseFloat(dht22Data.humidity);

        status.update({
          temperatureDht,
          humidity,
          dht22Status:     dht22Data.status,
          dht22Timestamp:  moment().format('HH:mm:ss'),
        });
      } else {
        globals.log.info(`Failed to get data from DHT22. Status=${dht22Data.status}`);

        status.update({dht22Status: dht22Data.status});

        await delay(5000);
      }
    }

    // Write the current time into the status file
    status.update({
      time: currentTime.format('HH:mm:ss')
    });

    // Get the wind threshold
    try {
      const newWindThreshold = await wind.getThreshold(globals);

      windThreshold = newWindThreshold.threshold;

      status.update({windThreshold});
    } catch(err) {
      globals.log.error('Failed to get wind threshold', err);
    }

    // Get the rain amount
    try {
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
  //      globals.log.debug('get sun.getThreshold');

      try {
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
        const newVitoTemperature = await vito.getTemperature();

        temperatureOutside = newVitoTemperature.temperatureOutside;

        status.update({temperatureOutside});
      } catch(err) {
        globals.log.error('Failed to get vito temperature', err);
      }
    }

  //       // Get the room temperature from the KTY81 sensor
  //       if(currentTime.second() % 2 === 0 || temperatureKty === undefined) {
  // //      globals.log.debug('get kty81.getTemperature');
  //
  //         kty81.getTemperature(globals)
  //         .then(newKty81Temperature => {
  // //          globals.log.debug(
  // //            'kty81.getTemperature ', newKty81Temperature.temperature);
  //           temperatureKty = newKty81Temperature.temperature;
  //
  //           status.update({temperatureKty});
  //
  //           return process.nextTick(() => done(null));
  //         })
  //         .catch(err => {
  //           globals.log.error(`Failed to get KTY81 temperature (${err})`);
  //
  //           return process.nextTick(() => done(null));
  //         });
  //       } else {
  //         return process.nextTick(() => done(null));
  //       }

    // Get the energy current power usage
    let stromFile = Buffer.from([]);
    let retries   = 5;

    try {
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
    // TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )
    const rrdNow     = rrdtool.nows();
    const rrdFile    = '/var/jalousie/jalousie.rrd';
    const rrdKeys    = [];
    const rrdValues  = [rrdNow];
    const rrdUpdates = {
      windThreshold:      windThreshold,
      sunThreshold:       sunThreshold,
  //        temperatureKty:     temperatureKty,
      temperatureDht:     temperatureDht,
      humidity:           humidity,
      temperatureOutside: temperatureOutside,
      weatherCode:        weatherCode,
      flagSun:            globals.flagSun,
      flagWindalarm:      globals.flagWindalarm,
      flagNight:          globals.flagNight,
      rain:               rainLevel,
    };

    _.forEach(rrdUpdates, (value, key) => {
      if(value === true) {
        rrdKeys.push(key);
        rrdValues.push(1);
      } else if(value === false) {
        rrdKeys.push(key);
        rrdValues.push(0);
      } else if(!_.isNil(value)) {
        rrdKeys.push(key);
        rrdValues.push(value);
      }
    });

    const rrdTmpl   = rrdKeys.join(':');
    const rrdUpdate = rrdValues.join(':');

    try {
//      if(currentTime.second() === 0) {
//        globals.log.info({rrdTmpl, rrdUpdate});
//      }

      await rrdtoolUpdate(rrdFile, rrdTmpl, [rrdUpdate]);
    } catch(err) {
      globals.log.error({err: err.message, rrdUpdate});
      globals.log.debug(`rrdValues: ${rrdValues}\n` +
        `rrdUpdate: ${rrdUpdate}`);
    }

    // Handle all the values
    if(!weatherData || !nightDownTime) {
      globals.log.info('No weather data yet. Skip further processing.');
    } else if(!temperatureDht) {
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
            action.start(globals, 'JALOUSIE_OFF');
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
          action.start(globals, 'JALOUSIE_UP_ON');
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
              action.start(globals, 'JALOUSIE_FULL_UP');
            }
          } else if(currentTime.format('HH:mm') === nightDownTime.format('HH:mm')) {
            // Night Runter - abends
            if(!flagNightAktiv) { // // Prevent triggering multiple times.
              flagNightAktiv = true;

              globals.log.info(`nightDownTime: ` +
                `${nightDownTime.format('HH:mm')}, ` +
                `(Sunset=${weatherData.sunset.format('HH:mm')}, ` +
                `wetterId=${weatherData.id} ${weatherData.main} ${weatherData.description} ${weatherData.cloudiness}%)`);
              globals.flagNight = true;
              globals.log.info('flagNight = true');

              action.start(globals, 'JALOUSIE_FULL_DOWN');
            }
          } else { // !one of the night events
            flagNightAktiv = false;

            if(!globals.flagNight) { // not night
              if(globals.flagSun) {
                if(timerSunDown) {
                  globals.log.info(`Reset timerSunDown\n` +
                    `  sunThreshold(${sunThreshold}/` +
                         `${globals.config.sun.up.threshold})\n` +
                    `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                         `${globals.config.sun.down.temp.degree})`);
                  timerSunDown = undefined;
                }

                if((sunThreshold < globals.config.sun.up.threshold) &&
                   (sunThreshold < globals.config.sun.down.temp.threshold ||
                    temperatureDht < globals.config.sun.down.temp.degree)
                ) {
                  if(!timerSunUp) {
                    globals.log.info(`Start timerSunUp\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunUp = moment.utc();
                  } else if(moment.utc().diff(timerSunUp, 'minutes') >=
                              globals.config.sun.up.delayMinutes
                  ) {
                    globals.log.info(`Trigger flagSun = false\n` +
                      `  timerSunUp >= ${globals.config.sun.up.delayMinutes}min`);
                    globals.flagSun = false;
                    timerSunUp = undefined;

                    action.start(globals, 'JALOUSIE_FULL_UP');
                  }
                } else {
                  if(timerSunUp) {
                    globals.log.info(`Reset timerSunUp\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunUp = undefined;
                  }
                }
              } else { // !flagSun
                if(timerSunUp) {
                  globals.log.info(`Reset timerSunUp\n` +
                    `  sunThreshold(${sunThreshold}/` +
                         `${globals.config.sun.up.threshold})\n` +
                    `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                         `${globals.config.sun.down.temp.degree})`);
                  timerSunUp = undefined;
                }

                if((sunThreshold >= globals.config.sun.down.threshold) ||
                   (sunThreshold >= globals.config.sun.down.temp.threshold &&
                    temperatureDht >= globals.config.sun.down.temp.degree)
                ) {
                  if(!timerSunDown) {
                    globals.log.info(`Start timerSunDown\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunDown = moment.utc();
                  } else if(moment.utc().diff(timerSunDown, 'minutes') >=
                              globals.config.sun.down.delayMinutes
                  ) {
                    globals.log.info(`Trigger flagSun = true\n` +
                      `  timerSunDown >= ${globals.config.sun.down.delayMinutes}min`);
                    globals.flagSun = true;
                    timerSunDown = undefined;

                    action.start(globals, 'JALOUSIE_SHADOW');
                  }
                } else { // !sunThreshold >= config.sun.down.threshold ||
                         // temperatureDht >= globals.config.sun.down.temp.degree
                  // Timer zuruecksetzen
                  if(timerSunDown) {
                    globals.log.info(`Reset timerSunDown\n` +
                      `  sunThreshold(${sunThreshold}/` +
                           `${globals.config.sun.up.threshold})\n` +
                      `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                           `${globals.config.sun.down.temp.degree})`);
                    timerSunDown = undefined;
                  }
                } // !sunThreshold >= config.sun.down.threshold ||
                  // temperatureDht >= globals.config.sun.down.temp.degree
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
      '                    Starting Jalousie with pigpiod');

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
      const dataWeather = await weather.getData(globals);
      const sunTimes   = suncalc.getTimes(new Date(), latitude, longitude);

      handleWeatherData(moment(), dataWeather, sunTimes);
    } catch(err) {
      // ignore
    }

    // Start web server
    globals.log.debug('start web server');
    webServer.startup(globals);

    // sets up the pigpio library
    globals.log.debug('init pigpiod');
    globals.pi = pigpiod.pigpio_start('pigpiod', '8888');
    if(globals.pi < 0) {
      globals.log.error('Failed to pigpiod.pigpio_start()');

      throw new Error('Failed to pigpiod.pigpio_start()');
    }

    globals.spi = pigpiod.spi_open(globals.pi, MCP3204_SPI_CHANNEL, 500000, 0);
    if(globals.spi < 0) {
      globals.log.error('Failed to pigpiod.spi_open()');

      throw new Error('Failed to pigpiod.spi_open()');
    }

    // Set the jalousie outputs to the initial state.
    action.init(globals);

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
