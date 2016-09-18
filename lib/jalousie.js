#!/usr/bin/env node
'use strict';

/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable no-lonely-if */
/* eslint-disable max-len */

const fs            = require('fs');

// https://lodash.com/docs
const _             = require('lodash');
// https://www.npmjs.com/package/npid
const npid          = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtool       = require('rrdtools');
// http://momentjs.com/docs/
const moment        = require('moment');
// https://www.npmjs.com/package/dank-do-while
const doWhile       = require('dank-do-while');
// http://caolan.github.io/async/
const async         = require('async');
// https://www.npmjs.com/package/fs-extra
const fsExtra       = require('fs-extra');
// https://www.npmjs.com/package/es6-promisify
const es6Promisify  = require('es6-promisify');
const access        = es6Promisify(fs.access);
const unlink        = es6Promisify(fs.unlink);
const readJson      = es6Promisify(fsExtra.readJson);
const rrdtoolUpdate = es6Promisify(rrdtool.update);

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
// const kty81      = require('./kty81');
const signal     = require('./signal');
const wind       = require('./wind');
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



// *************************************************************************
// Globals

// variables I'm sharing into the modules
let globals = {
  config:         undefined,
  flagNight:      false,
  flagSun:        false,
  flagWindalarm:  false,
  mainLoopStatus: 'STARTUP',
  pi:             undefined
};



// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNightAktiv    = false;
let temperatureOutside;
let sunThreshold;
let windThreshold;
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



const handleWeatherData = function(currentTime, dataWeather) {
  weatherData          = dataWeather;
  weatherCode          = dataWeather.code;
  weatherRefreshedHour = currentTime.hour();
  nightDownTime        =
    weather.getNightDownTime(globals, dataWeather, currentTime, nightDownTime);
  status.update({
    weatherCode:   dataWeather.code,
    weatherText:   dataWeather.text,
    sunrise:       dataWeather.sunrise.format('HH:mm'),
    sunset:        dataWeather.sunset.format('HH:mm'),
    nightDownTime: nightDownTime.format('HH:mm')
  });
};


// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
const mainLoop = function(next) {
//  globals.log.debug('Start main loop');

  // Zeit holen für spätere Bedingungen auf der Uhrzeit.
  const currentTime = moment();

  async.waterfall([
    done => {
      if((currentTime.minute() === 0 &&
          currentTime.hour() !== weatherRefreshedHour) ||
         nightDownTime === undefined ||
         weatherData === undefined
      ) {
//        globals.log.debug('get weather');
        weather.getData(globals).then(newWeather => {
          handleWeatherData(currentTime, newWeather);

          return done(null);
        })
        .catch(err => {
          globals.log.error('Failed to get weather data', err);

          return done(null);
        });
      } else {
        return done(null);
      }
    },
    done => {
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
            dht22Timestamp:  moment().format('HH:mm:ss')
          });
        } else {
          globals.log.info(
            `Failed to get data from DHT22. Status=${dht22Data.status}`);

          status.update({
            dht22Status:     dht22Data.status
          });
        }
      }

      return done(null);
    },
    done => {
      // Write the current time into the status file
      status.update({
        time: currentTime.format('HH:mm:ss')
      });

      return done(null);
    },
    done => {
      // Get the wind threshold
      wind.getThreshold(globals).then(newWindThreshold => {
        windThreshold = newWindThreshold.threshold;

        status.update({windThreshold});

        return done(null);
      })
      .catch(err => {
        globals.log.error('Failed to get wind threshold', err);

        return done(null);
      });
    },
    done => {
      // Get the sun threshold
      if(currentTime.second() % 2 === 0 || sunThreshold === undefined) {
//      globals.log.debug('get sun.getThreshold');

        sun.getThreshold(globals)
        .then(newSunThreshold => {
//        globals.log.debug('sun.getThreshold ', newSunThreshold);
          sunThreshold = newSunThreshold.threshold;

          status.update({sunThreshold});

          return done(null);
        })
        .catch(err => {
          globals.log.error('Failed to get sun threshold', err);

          return done(null);
        });
      } else {
        return done(null);
      }
    },
    done => {
      // Get the outside temperature from the Vito
      if(currentTime.second() === 10 || temperatureOutside === undefined) {
        vito.getTemperature().then(newVitoTemperature => {
          temperatureOutside = newVitoTemperature.temperatureOutside;

          status.update({temperatureOutside});

          return done(null);
        })
        .catch(err => {
          globals.log.error('Failed to get vito temperature', err);

          return done(null);
        });
      } else {
        return done(null);
      }
    },
//     done => {
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
//           return done(null);
//         })
//         .catch(err => {
//           globals.log.error(`Failed to get KTY81 temperature (${err})`);
//
//           done(null);
//         });
//       } else {
//         return done(null);
//       }
//     },
    done => {
      // Update values into rrd database
      // TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )
      const rrdNow     = rrdtool.nows();
      const rrdFile    = '/var/jalousie/jalousie.rrd';
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
        flagNight:          globals.flagNight
      };

      _.values(rrdUpdates).forEach(value => {
        if(value === true) {
          rrdValues.push(1);
        } else if(value === false) {
          rrdValues.push(0);
        } else {
          rrdValues.push(value);
        }
      });

      const rrdTmpl   = _.keys(rrdUpdates).join(':');
      const rrdUpdate = rrdValues.join(':');

      rrdtoolUpdate(rrdFile, rrdTmpl, [rrdUpdate]).then(() => {
        return done(null);
      })
      .catch(err => {
        globals.log.error(err);
        globals.log.debug(`rrdValues: ${rrdValues}\n` +
          `rrdUpdate: ${rrdUpdate}`);

        return done(null);
      });
    },
    done => {
      if(!weatherData || !nightDownTime) {
        globals.log.info('No weather data yet. Skip further processing.');

        return done(null);
      }

      if(!temperatureDht) {
        globals.log.info('No DHT data yet. Skip further processing.');

        return done(null);
      }

      // so, jetzt habe ich die werte und kann darauf reagieren.
      if(globals.flagWindalarm) {
        // TODO im original gibt es noch die Bedingung
        // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
        // ohne Verzoegerung.
        if(windThreshold < globals.config.wind.up.threshold) {
          if(!timerWind) {
            globals.log.info(`Start timerWind\n` +
              `  windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
            timerWind = moment.utc();
          } else if(moment.utc().diff(timerWind, 'minutes') > 10) {
            globals.log.info(`windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
            globals.log.info('timerWind > 10min');
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
              `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
            timerWind = undefined;
          }
        }
      } else { // !flagWindalarm
        if(windThreshold >= globals.config.wind.up.threshold) {
          globals.log.info(`windThreshold(${windThreshold}) >= ` +
            `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
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
                `config.night.up(${globals.config.night.up})`);

              // TODO das waere die stelle, mal zu pruefen, ob die jalousie
              // wegen sonne/temperatur gleich in schattenposition gehen sollte.
              action.start(globals, 'JALOUSIE_FULL_UP');
            }
          } else if(currentTime.format('HH:mm')
                      === nightDownTime.format('HH:mm')
          ) {
            // Night Runter - abends
            if(!flagNightAktiv) { // // Prevent triggering multiple times.
              flagNightAktiv = true;

              globals.log.info(`nightDownTime: ` +
                `${nightDownTime.format('HH:mm')}, ` +
                `(Sunset=${weatherData.sunset.format('HH:mm')}, ` +
                `wetterCode=${weatherData.code} ${weatherData.text})`);
              globals.flagNight = true;
              globals.log.info('flagNight = true');

              action.start(globals, 'JALOUSIE_FULL_DOWN');
            }
          } else { // !one of the night events
            flagNightAktiv = false;

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
              } else { // !sunThreshold >= config.sun.down.threshold || temperatureDht >= globals.config.sun.down.temp.degree
                // Timer zuruecksetzen
                if(timerSunDown) {
                  globals.log.info(`Reset timerSunDown\n` +
                    `  sunThreshold(${sunThreshold}/` +
                         `${globals.config.sun.up.threshold})\n` +
                    `  temperatureDht(${temperatureDht.toFixed(1)}/` +
                         `${globals.config.sun.down.temp.degree})`);
                  timerSunDown = undefined;
                }
              } // !sunThreshold >= config.sun.down.threshold || temperatureDht >= globals.config.sun.down.temp.degree
            } // !flagSun
          } // !one of the night events
        } // !windThreshold >= config.sun.up.threshold
      } // !flagWindalarm

      return done(null);
    },
    done => {
      status.update({
        flagNight:     globals.flagNight,
        flagSun:       globals.flagSun,
        flagWindalarm: globals.flagWindalarm
      });

      return done(null);
    },
    done => {
      if(timerSunUp) {
        status.update({timerSunUp:
          moment.utc(moment.utc().diff(timerSunUp)).format('HH:mm:ss')});
      } else {
        status.update({timerSunUp: false});
      }
      if(timerSunDown) {
        status.update({timerSunDown:
          moment.utc(moment.utc().diff(timerSunDown)).format('HH:mm:ss')});
      } else {
        status.update({timerSunDown: false});
      }
      if(timerWind) {
        status.update({timerWind:
          moment.utc(moment.utc().diff(timerWind)).format('HH:mm:ss')});
      } else {
        status.update({timerWind: false});
      }

      status.write().then(() => {
        return done(null);
      })
      .catch(() => {
        return done(null);
      });
    }
  ], err => {
    if(err) {
      console.error(err);
      globals.log.error(err);
    }

    if(['STARTUP', 'RUNNING'].includes(globals.mainLoopStatus)) {
      setTimeout(() => next(true), 1000);
    } else {
      return next(false);
    }
  });
};



// *************************************************************************
// main()
const pidFile = '/var/jalousie/jalousie.pid';

// First there is the initialization, as a list of async tasks.
async.waterfall([
  done => {
    // Read initial config
    configFile.read().then(config => {
      if(!config) {
        return done('Failed to read configuration.');
      }

      globals.config = config;

      return done(null);
    })
    .catch(done);
  },
  done => {
    globals.log = logging(globals);

    return done();
  },
  done => {
    globals.log.info('-----------------------------------\n' +
      '                    Starting Jalousie mit pigpiod');

    return done();
  },
  done => {
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

    return done(null);
  },
  done => {
    // Check if pid file exists.
    access(pidFile, fs.constants.W_OK).then(() => {
      globals.log.debug('pid file exists');

      return done(null, true);
    })
    .catch(() => {
      // File does not exist, ok.
      return done(null, false);
    });
  },
  (pidFileExists, done) => {
    // Read pid file
    if(!pidFileExists) {
      return done(null, null);
    }

    readJson(pidFile).then(pid => {
      return done(null, pid);
    })
    .catch(done);
  },
  (pid, done) => {
    // Check if process is still running
    if(!pid) {
      return done(null, null);
    }

    try {
      process.kill(pid, 0);
    } catch(errKill) {
      // Process does not exist
      globals.log.debug(`process with pid ${pid} does not exist`);

      return done(null, pid);
    }

    return done(`Process still running with pid ${pid}`);
  },
  (pid, done) => {
    // Unlink old pid file
    if(!pid) {
      return done(null);
    }

    unlink(pidFile).then(() => {
      globals.log.debug('pid file removed');

      return done(null);
    })
    .catch(done);
  },
  done => {
    // Create a new pid file
    try {
      const pidFileHandle = npid.create(pidFile);

      pidFileHandle.removeOnExit();
    } catch(err) {
      globals.log.debug(`Failed to open ${pidFile}`);

      return done(err);
    }

    globals.log.debug('pid file created');

    return done(null);
  },
  done => {
    // Read and restore the last flags from the status file
    // TODO wie alt ist das flags file?
    status.read().then(oldStatus => {
      globals.flagSun       = oldStatus.flagSun       | false;
      globals.flagNight     = oldStatus.flagNight     | false;
      globals.flagWindalarm = oldStatus.flagWindalarm | false;

      return done(null);
    })
    .catch(done);
  },
  done => {
    // Initialize process status.xml file
    status.update({process: 'startup', mode: 'normal'});
    status.write().then(() => {
      return done(null);
    })
    .catch(done);
  },
  done => {
    // Read initial weather
    globals.log.debug('get weather');
    weather.getData(globals).then(dataWeather => {
      handleWeatherData(moment(), dataWeather);

      return done(null);
    })
    .catch(() => {
      return done(null);
    });
  },
  done => {
    // Start web server
    globals.log.debug('start web server');
    webServer.startup(globals);

    return done(null);
  },
  done => {
    // sets up the pigpio library
    globals.log.debug('init pigpiod');
    globals.pi = pigpiod.pigpio_start();
    if(globals.pi < 0) {
      globals.log.error('Failed to pigpiod.pigpio_start()');

      return done('Failed to pigpiod.pigpio_start()');
    }

    globals.spi =
      pigpiod.spi_open(globals.pi, MCP3204_SPI_CHANNEL, 500000, 0);
    if(globals.spi < 0) {
      globals.log.error('Failed to pigpiod.spi_open()');

      return done('Failed to pigpiod.spi_open()');
    }

    // Set the jalousie outputs to the initial state.
    action.init(globals);

    // Set wind sensor to generate an interrupt on high-to-low transitions.
    wind.init(globals);

    // Set buttons to trigger actions.
    buttons.init(globals);

    // Initialize the signal handler to properly cleanup on shutdown.
    signal.installCleanupOnStop(globals);

    return done(null);
  },
  done => {
    // Initialize process flags and write into the status.xml file
    globals.log.debug('init flags and status');
    status.update({process: 'running', mode: 'normal'});
    status.write().then(() => {
      return done(null);
    })
    .catch(done);
  },
  done => {
    globals.log.debug('start main loop');
    doWhile(next => {
      mainLoop(next);
    }, () => {
      globals.mainLoopStatus = 'STOPPED';
      globals.log.info('Terminated mainLoop');

      return done(null);
    });
  }
], err => {
  if(err) {
    console.error(err);
    globals.log.error(err);

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }

  globals.log.info('Terminated waterfall');
});
