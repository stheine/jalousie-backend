#!/usr/bin/env node
'use strict';

/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable no-lonely-if */

const fs               = require('fs');

// https://lodash.com/docs
const _                = require('lodash');
// https://www.npmjs.com/package/npid
const npid             = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtool          = require('rrdtools');
// http://momentjs.com/docs/
const moment           = require('moment');
// https://www.npmjs.com/package/promise-results
// TODO ? const promiseAllByKeys = require('promise-results/allKeys');
// https://www.npmjs.com/package/dank-do-while
const doWhile          = require('dank-do-while');
// http://caolan.github.io/async/
const async            = require('async');


// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod    = require('@stheine/pigpiod');

const configFile = require('./configFile');
const kty81      = require('./kty81');
const signal     = require('./signal');
const wind       = require('./wind');
const sun        = require('./sun');
const vito       = require('./vito');
const weather    = require('./weather');
const status     = require('./status');
const action     = require('./action');
const webServer  = require('./webServer');

const {logDebug, logInfo, logError} = require('./troubleshooting');

// TODO Automatik vs Handbetrieb. wirkt sich auf schaltzeiten(night)
//      und sonne aus.
// TODO Da möchte ich aber einen zusätzlichen modus haben,
//      der den Handbetrieb nur für die Sonne gelten lässt,
//      und nach der nächsten Schaltzeit wieder auf Automatik schaltet.
// TODO beim neustart auf die flags wieder aufsetzen? (Wind/ Sonne/ Auto)

const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder

const GPIO_TASTER_RUNTER   = 22; // GPIO22, Pin15 - Input  - Taster runter
const GPIO_TASTER_HOCH     = 27; // GPIO27, Pin13 - Input  - Taster hoch
const GPIO_JALOUSIE_RUNTER =  4; // GPIO4,  Pin7  - Output - Jalousie runter
const GPIO_JALOUSIE_HOCH   = 17; // GPIO17, Pin11 - Output - Jalousie hoch

const MCP3204_SPI_CHANNEL  =  0; // MCP3204 is connected to SPI channel #0



// *************************************************************************
// Globals

// variables I'm sharing into the modules
const globals = {
  config:        undefined,
  flagNight:     false,
  flagSun:       false,
  flagWindalarm: false,
  pi:            undefined
};




// Tasten
let stateTasterRunter = 1;
let stateTasterHoch   = 1;

let mainLoopStatus    = 'STARTUP';
// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNightAktiv    = false;
let temperatureOutside;
let sunThreshold;
let windThreshold;
let temperatureKty;
let temperatureDht;
let humidity;
let timerWind;
let timerSunDown;
let timerSunUp;
let weatherData;
let weatherCode;
let weatherRefreshedHour;
let nightDownTime;



// *************************************************************************
// intrGpioTaster() - Interrupt handler for Jalousie Inputs
let intrGpioTasterLastTick;
let intrGpioTasterTriggerTick;
const intrGpioTaster = function(intrPi, intrGpio, intrLevel, intrTick) {
  let actionCommand;
  let tasterString;
  let levelString;

  if(!intrGpioTasterLastTick || !intrGpioTasterTriggerTick) {
    intrGpioTasterLastTick    = intrTick;
    intrGpioTasterTriggerTick = intrTick;

    return;
  }
  const tickSinceLast    = intrTick - intrGpioTasterLastTick;
  const tickSinceTrigger = intrTick - intrGpioTasterTriggerTick;

  intrGpioTasterLastTick = intrTick;

  switch(intrGpio) {
    case GPIO_TASTER_HOCH:
      actionCommand = 'JALOUSIE_HOCH_';
      break;

    case GPIO_TASTER_RUNTER:
      actionCommand = 'JALOUSIE_RUNTER_';
      break;

    default:
      logError(`Unhandled interrupt trigger intrGpio=${intrGpio}`);

      return;
  }

  if(intrLevel) {
    levelString = 'Losgelassen';
    actionCommand += 'AUS';
  } else {
    levelString = 'Gedrückt';
    actionCommand += 'AN';
  }

  // War dies die Stop Taste? Diese laesst fix nach ~140ms los,
  // daher kann ich sie beim Loslassen recht gut erkennen.
  if(intrLevel &&
     tickSinceTrigger > 140000 && tickSinceTrigger < 150000
  ) {
    // Stop
    logInfo(`Taster JALOUSIE_STOP, ${levelString} ${tickSinceTrigger}`);
    stateTasterHoch   = 1;
    stateTasterRunter = 1;

    if(globals.flagWindalarm) {
      logInfo('flagWindalarm unterdrueckt JALOUSIE_STOP');
    } else {
      action.start('JALOUSIE_AUS', globals);
    }
  } else { // Stop
    // Logik um falsche Interrupts zu unterdruecken.
    // Prellende Tasten.
    if(tickSinceLast < 100000) {
      // Mehrere Tastendruecke innerhalb 0.5 Sekunde. Prellt.

      // within debounceTime limit
//      if(tickSinceLast > 1000) {
//        // log the longer ones only
//        logInfo(`debounce (${tasterString}, ${levelString}) ` +
//              `${tickSinceLast} ${intrTick}`);
//      }

      return;
    }
//    else {
//      time_sleep(0.000050) // 50us
// TODO    }



    // 'Taster Losgelassen', obwohl er noch gedrueckt ist, nach ~280ms.
    if(intrLevel &&
       tickSinceLast > 260000 && tickSinceLast < 300000
    ) {
      // Hier warte ich lieber mal kurz und frage den echten Wert nochmal ab.
// TODO      time_sleep(0.000100); // 100us
//      realLevel = pigpiod.gpio_read(intrPi, intrGpio);
//      if(realLevel != intrLevel) {
//        logInfo(`additional debounce (${tasterString}, ${levelString}) ` +
//          `${tickSinceLast}`);
//
//        return;
//      } else {
      logInfo(`tja (${tasterString}, ${levelString}) ${tickSinceLast}`);
//      }
    }



    // Phantom Interrupts, auf den Wert, auf dem die Taste sowieso schon steht.
    if(intrGpio === GPIO_TASTER_HOCH) {
      if(stateTasterHoch === intrLevel) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        logInfo(
          `phantom (${tasterString}, ${levelString}) ${tickSinceLast}`);

        return;
      }
      stateTasterHoch = intrLevel;
//      stateTasterHoch = pigpiod.gpio_read(intrPi, GPIO_TASTER_HOCH);
    } else if(intrGpio === GPIO_TASTER_RUNTER) {
      if(stateTasterRunter === intrLevel) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        logInfo(
          `phantom (${tasterString}, ${levelString}) ${tickSinceLast}`);

        return;
      }
      stateTasterRunter = intrLevel;
//      stateTasterRunter = pigpiod.gpio_read(intrPi, GPIO_TASTER_RUNTER);
    }


    // Jetzt kann ich die Tastendruck weitergeben.

    logDebug(`intrGpioTaster(${intrGpio}, ${intrLevel}) ` +
      `realLevel=${pigpiod.gpio_read(intrPi, intrGpio)}`);
    logInfo(`intrGpioTaster(${intrGpio}, ${intrLevel}) ` +
      `realLevel=${pigpiod.gpio_read(intrPi, intrGpio)}`);
    logInfo(`intrGpioTaster(${intrGpio}, ${intrLevel})`);

    logInfo(`Taster ${tasterString}, ${levelString} ${tickSinceLast}`);

    if(globals.flagWindalarm) {
      logInfo(`flagWindalarm unterdrueckt ${actionCommand}`);
    } else {
      action.start(actionCommand, globals);
    }
  } // Stop

  intrGpioTasterTriggerTick = intrTick;
};



const cleanup = function() {
  return new Promise(resolveCleanup => {
    logInfo('Quit process');

    mainLoopStatus = 'CANCEL';

    new Promise(resolveMainLoopStop => {
      let timeout;

      const interval = setInterval(() => {
        if(mainLoopStatus === 'STOPPED') {
          if(timeout) {
            clearTimeout(timeout);
          }

          return resolveMainLoopStop();
        }

        logDebug('Waiting for main loop to stop');
      }, 100);

      timeout = setTimeout(() => {
        if(interval) {
          clearInterval(interval);
        }

        logDebug('Terminating main loop after timeout');

        return resolveMainLoopStop();
      }, 2000);
    })
    .then(() => {
      if(globals.spi) {
        pigpiod.spi_close(globals.pi, globals.spi);
        globals.spi = undefined;
      }

      if(globals.pi) {
        pigpiod.pigpio_stop(globals.pi);
        globals.pi = undefined;
      }

      status({process: 'stopped'}).then(resolveCleanup());
    });
  });
};


const handleWeatherData = function(currentTime, dataWeather) {
  weatherData          = dataWeather;
  weatherCode          = dataWeather.code;
  weatherRefreshedHour = currentTime.hour();
  nightDownTime        =
    weather.getNightDownTime(dataWeather, currentTime, nightDownTime);
  status({
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
//  logDebug('Start main loop');

  // Zeit holen für spätere Bedingungen auf der Uhrzeit.
  const currentTime = moment();

  async.waterfall([
    done => {
      if((currentTime.minute() === 0 &&
          currentTime.hour() !== weatherRefreshedHour) ||
         nightDownTime === undefined ||
         weatherData === undefined
      ) {
        logDebug('get weather');
        weather.getData(globals.config).then(newWeather => {
          handleWeatherData(currentTime, newWeather);

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
        logDebug('get dht22Data');

        const dht22Data = pigpiod.dht22(globals.pi, 18);

        logDebug('dht22Data', dht22Data);

        if(dht22Data.status === pigpiod.DHT_GOOD) {
//          logDebug('dht22 data received');
          temperatureDht = parseFloat(dht22Data.temperature);
          humidity       = parseFloat(dht22Data.humidity);

          status({
            temperatureDht:  temperatureDht,
            humidity:        humidity,
            dht22Status:     dht22Data.status,
            dht22Timestamp:  moment().format('HH:mm:ss')
          }).then(() => {
            done(null);
          });
        } else {
          logInfo(
            `Failed to get data from DHT22. Status=${dht22Data.status}`);
          status({
            dht22Status:     dht22Data.status
          }).then(() => {
            done(null);
          });
        }
      } else {
        done(null);
      }
    },
    done => {
      // Write the current time into the status file
      status({
        time: currentTime.format('HH:mm:ss')
      }).then(() => {
        done(null);
      });
    },
    done => {
      // Get the wind threshold
      wind.getThreshold(globals.pi).then(newWindThreshold => {
        windThreshold = newWindThreshold.threshold;

        status({
          windThreshold: newWindThreshold.threshold
        }).then(() => {
          done(null);
        });
      });
    },
    done => {
      // Get the sun threshold
      if(currentTime.second() % 2 === 0 || sunThreshold === undefined) {
//      logDebug('get sun.getThreshold');

        sun.getThreshold(globals.pi, globals.spi)
        .then(newSunThreshold => {
//        logDebug('sun.getThreshold ', newSunThreshold);
          sunThreshold = newSunThreshold.threshold;

          status({
            sunThreshold: newSunThreshold.threshold
          }).then(() => {
            done(null);
          });
        });
      } else {
        done(null);
      }
    },
    done => {
      // Get the outside temperature from the Vito
      vito.getTemperature().then(newVitoTemperature => {
        temperatureOutside = newVitoTemperature.temperatureOutside;

        status({
          temperatureOutside: newVitoTemperature.temperatureOutside
        }).then(() => {
          done(null);
        });
      });
    },
    done => {
      // Get the room temperature from the KTY81 sensor
      if(currentTime.second() % 2 === 0 || temperatureKty === undefined) {
//      logDebug('get kty81.getTemperature');

        kty81.getTemperature(globals.pi, globals.spi)
        .then(newKty81Temperature => {
//        logDebug('kty81.getTemperature ', newKty81Temperature.temperature);
          temperatureKty = newKty81Temperature.temperature;

          status({
            temperatureKty: newKty81Temperature.temperature
          }).then(() => {
            done(null);
          });
        });
      } else {
        done(null);
      }
    },
    done => {
      if(!weatherData || !nightDownTime) {
        logInfo('No weather data yet. Skip further processing.');

        return done(null);
      }



      // Update values into rrd database
      // TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )
      const rrdNow     = rrdtool.nows();
      const rrdFile    = '/var/jalousie/jalousie.rrd';
      const rrdValues  = [rrdNow];
      const rrdUpdates = {
        windThreshold:      windThreshold,
        sunThreshold:       sunThreshold,
        temperatureKty:     temperatureKty,
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

      rrdtool.update(rrdFile, rrdTmpl, [rrdUpdate], errUpdate => {
        if(errUpdate) {
          logError(errUpdate);
          logDebug(`rrdValues: ${rrdValues}\n` +
            `rrdUpdate: ${rrdUpdate}`);

          return done(null);
        }
      });



      // so, jetzt habe ich die werte und kann darauf reagieren.
      if(globals.flagWindalarm) {
        // TODO im original gibt es noch die Bedingung
        // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
        // ohne Verzoegerung.
        if(windThreshold < globals.config.wind.up.threshold) {
          if(!timerWind) {
            logInfo(`windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
            logInfo('Start timerWind');
            timerWind = moment.utc();
          } else if(moment.utc().diff(timerWind, 'minutes') > 10) {
            logInfo(`windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
            logInfo('moment().diff(timerWind) > 10min');
            globals.flagWindalarm = false;
            logInfo('flagWindalarm = false');
            timerWind = undefined;

            status({mode: 'zurueck'}); // TODO was war vorher? => normal

            // Alarm abschalten.
            action.start('JALOUSIE_AUS', globals);
            if(globals.flagNight) {
              // TODO will ich das wirklich? nachts die jalousien bewegen?
              //      vielleicht besser noch zeitlich einschraenken...

              // TODO
              // Jalousien wieder auf den vorigen Stand bringen
              //   - impuls runter
              //   - warten bis sicher unten
            } // flagNight
          }
        }
      } else { // flagWindalarm
        if(windThreshold >= globals.config.wind.up.threshold) {
          logInfo(`windThreshold(${windThreshold}) >= ` +
            `config.wind.up.threshold(${globals.config.wind.up.threshold})`);
          globals.flagWindalarm  = true;
          logInfo('flagWindalarm = true');
          status({mode: 'Windalarm'});

          // Wenn wirklich noch Sonne ist, gehen die Jalousien
          // ja bald wieder runter.
          globals.flagSun = false;
          timerSunDown = undefined;

          // To alarm, signal up and leave the level there.
          action.start('JALOUSIE_HOCH_AN', globals);
        } else { // windThreshold >= config.wind.up.threshold
          if(currentTime.hour()   === globals.config.night.up.hour &&
             currentTime.minute() === globals.config.night.up.minute
          ) {
            // Night Hoch - morgens
            if(!flagNightAktiv) {
              flagNightAktiv = true;

              logInfo(`config.night.up(` +
                `${_.padStart(globals.config.night.up.hour, 2, 0)}:` +
                `${_.padStart(globals.config.night.up.minute, 2, 0)})`);
              globals.flagNight = false;
              logInfo('flagNight = false');

              // Start new thread.
              action.start('JALOUSIE_GANZHOCH', globals);
            }
          } else if(currentTime.format('HH:mm')
                      === nightDownTime.format('HH:mm')
          ) {
            // Night Runter - abends
            if(!flagNightAktiv) {
              flagNightAktiv = true;

              logInfo(`nightDownTime: ` +
                `${nightDownTime.format('HH:mm')}, ` +
                `(Sunset=${weatherData.sunset.format('HH:mm')}, ` +
                `wetterCode=${weatherData.code} ${weatherData.text})`);
              globals.flagNight = true;
              logInfo('flagNight = true');

              // Start new thread.
              action.start('JALOUSIE_GANZRUNTER', globals);
            }
          } else { // Night
            flagNightAktiv = false;

            if(globals.flagSun) {
              if(sunThreshold <= globals.config.sun.up.threshold) {
                if(!timerSunUp) {
                  logInfo(`sunThreshold(${sunThreshold}) <= ` +
                    `config.sun.up.threshold` +
                    `(${globals.config.sun.up.threshold})`);
                  logInfo('Start timerSunUp');
                  timerSunUp = moment.utc();
                } else if(moment.utc().diff(timerSunUp, 'minutes') >=
                            globals.config.sun.up.delayMinutes
                ) {
                  logInfo(`sunThreshold(${sunThreshold}) <= ` +
                    `config.sun.up.threshold` +
                    `(${globals.config.sun.up.threshold})`);
                  logInfo(`moment().diff(timerSunUp) >= ` +
                    `${globals.config.sun.up.delayMinutes}min`);
                  globals.flagSun = false;
                  logInfo('flagSun = false');
                  timerSunUp = undefined;

                  // Start new thread.
                  action.start('JALOUSIE_GANZHOCH', globals);
                }
              } // sunThreshold <= config.sun.up.threshold
            } else { // flagSun
              if((sunThreshold >= globals.config.sun.up.threshold) ||
                 (sunThreshold >= (globals.config.sun.down.threshold - 4) &&
                  temperatureDht >= globals.config.temperature.down.degree)
              ) {
                if(!timerSunDown) {
                  if(sunThreshold >= globals.config.sun.down.threshold) {
                    logInfo(`sunThreshold(${sunThreshold}) >= ` +
                      `config.sun.down.threshold` +
                      `(${globals.config.sun.down.threshold})`);
                  } else if(sunThreshold >=
                              (globals.config.sun.down.threshold - 4) &&
                            temperatureDht >=
                              globals.config.temperature.down.degree
                  ) {
                    logInfo(`sunThreshold(${sunThreshold}) >= ` +
                      `config.sun.down.threshold(` +
                      `${globals.config.sun.down.threshold - 4}) && ` +
                      `temperatureDht(${temperatureDht.toFixed(1)}) >= ` +
                      `config.temperature.down.degree(` +
                      `${globals.config.temperature.down.degree})`);
                  } else {
                    logError(`sunThreshold=${sunThreshold}, ` +
                      `temperatureDht=${temperatureDht.toFixed(1)}`);
                  }
                  logInfo('Start timerSunDown');
                  timerSunDown = moment.utc();
                } else if(moment.utc().diff(timerSunDown, 'minutes') >=
                            globals.config.sun.down.delayMinutes
                ) {
                  logInfo(`sunThreshold(${sunThreshold}) >= ` +
                    `config.sun.down.threshold` +
                    `(${globals.config.sun.down.threshold})`);
                  logInfo(`moment().diff(timerSunDown) >= ` +
                    `${globals.config.sun.down.delayMinutes}min`);
                  globals.flagSun = true;
                  logInfo('flagSun = true');
                  timerSunDown = undefined;

                  // Start new thread.
                  action.start('JALOUSIE_SCHATTEN', globals);
                }
              } else { // sunThreshold >= config.sun.down.threshold
                // Timer zuruecksetzen
                if(timerSunDown) {
                  logInfo(`sunThreshold(${sunThreshold}) < ` +
                    `config.sun.down.threshold` +
                    `(${globals.config.sun.down.threshold})`);
                  timerSunDown = undefined;
                }
              } // sunThreshold >= config.sun.down.threshold
            } // flagSun
          } // Night
        } // windThreshold >= config.sun.up.threshold
      } // flagWindalarm

      status({
        flagNight:        globals.flagNight,
        flagSun:          globals.flagSun,
        flagWindalarm:    globals.flagWindalarm
      });

      if(timerSunUp) {
        status({
          timerSunUp:
            moment.utc(moment.utc().diff(timerSunUp)).format('HH:mm:ss')
        });
      } else {
        status({
          timerSunUp: false
        });
      }
      if(timerSunDown) {
        status({
          timerSunDown:
            moment.utc(moment.utc().diff(timerSunDown)).format('HH:mm:ss')
        });
      } else {
        status({
          timerSunDown: false
        });
      }
      if(timerWind) {
        status({
          timerWind:
            moment.utc(moment.utc().diff(timerWind)).format('HH:mm:ss')
        });
      } else {
        status({
          timerWind: false
        });
      }

      done(null);
    }
  ], err => {
    if(err) {
      logError(err);
    }

    if(['STARTUP', 'RUNNING'].includes(mainLoopStatus)) {
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
    logInfo('-----------------------------------------------------------\n' +
      '               Starting Jalousie mit pigpiod');

    // Initialize process flags and write into the status.xml file
    status({process: 'startup', mode: 'normal'}).then(done);
  },
  done => {
    process.on('uncaughtException', err => {
      logError(`Uncaught exception: ${err}`); // TODO err call stack
      console.log(err);
      process.exit(10);
    });

    process.on('unhandledRejection', reason => {
      logError(`Unhandled rejection: ${reason}`); // TODO reason call stack
      console.log(reason);
      process.exit(11);
    });

    return done(null);
  },
  done => {
    // Check if pid file exists. Check if process running.
    fs.access(pidFile, fs.constants.W_OK, errAccess => {
      if(errAccess) {
        // File does not exist, ok.
        return done(null, false);
      }

      logDebug('pid file exists');

      return done(null, true);
    });
  },
  (pidFileExists, done) => {
    if(!pidFileExists) {
      return done(null, null);
    }

    fs.readFile(pidFile, (errReadFile, data) => {
      if(errReadFile) {
        return done(errReadFile);
      }

      return done(null, parseInt(data, 10));
    });
  },
  (pid, done) => {
    if(!pid) {
      return done(null, null);
    }

    try {
      process.kill(pid, 0);
    } catch(errKill) {
      // Process does not exist
      logDebug(`process with pid ${pid} does not exist`);

      return done(null, pid);
    }

    return done(`Process still running with pid ${pid}`);
  },
  (pid, done) => {
    if(!pid) {
      return done(null);
    }

    fs.unlink(pidFile, errUnlink => {
      if(errUnlink) {
        return done(errUnlink);
      }

      logDebug('pid file removed');

      return done(null);
    });
  },
  done => {
    try {
      const pidFileHandle = npid.create(pidFile);

      pidFileHandle.removeOnExit();
    } catch(errNpid) {
      logDebug(`Failed to open ${pidFile}`);

      return done(errNpid);
    }

    logDebug('pid file created');

    return done(null);
  },
  done => {
    // Config
    logDebug('get config');
    configFile.read().then(config => {
      if(!config) {
        return done('Failed to read configuration.');
      }

      globals.config = config;

      return done(null);
    });
  },
  done => {
    logDebug('get weather');
    weather.getData(globals.config).then(dataWeather => {
      handleWeatherData(moment(), dataWeather);

      return done(null);
    });
  },
  done => {
    logDebug('start web server');
    webServer.startup(globals);

    return done(null);
  },
  done => {
    // sets up the pigpio library
    globals.pi = pigpiod.pigpio_start();
    if(globals.pi < 0) {
      logError('Failed to pigpiod.pigpio_start()');

      return done('Failed to pigpiod.pigpio_start()');
    }

    globals.spi =
      pigpiod.spi_open(globals.pi, MCP3204_SPI_CHANNEL, 500000, 0);
    if(globals.spi < 0) {
      logError('Failed to pigpiod.spi_open()');

      return done('Failed to pigpiod.spi_open()');
    }

    // initialize GPIO for Jalousie
    // input, pull-up
    pigpiod.set_mode(globals.pi, GPIO_TASTER_RUNTER, pigpiod.PI_INPUT);
    pigpiod.set_pull_up_down(globals.pi, GPIO_TASTER_RUNTER, pigpiod.PI_PUD_UP);
    pigpiod.set_glitch_filter(globals.pi, GPIO_TASTER_RUNTER, 50);

    pigpiod.set_mode(globals.pi, GPIO_TASTER_HOCH, pigpiod.PI_INPUT);
    pigpiod.set_pull_up_down(globals.pi, GPIO_TASTER_HOCH, pigpiod.PI_PUD_UP);
    pigpiod.set_glitch_filter(globals.pi, GPIO_TASTER_HOCH, 50);

    pigpiod.set_mode(globals.pi, GPIO_WIND, pigpiod.PI_INPUT);
    pigpiod.set_pull_up_down(globals.pi, GPIO_WIND, pigpiod.PI_PUD_UP);

    // output, init 0 -> Transistor open -> Jalousie pull-up remains on 5V.
    pigpiod.set_mode(globals.pi, GPIO_JALOUSIE_HOCH, pigpiod.PI_OUTPUT);
    pigpiod.set_mode(globals.pi, GPIO_JALOUSIE_RUNTER, pigpiod.PI_OUTPUT);
    // TODO move into action.init()

    logInfo('Init: JALOUSIE_AUS');
    action.start('JALOUSIE_AUS', globals);

    // set GPIO inputs to generate an interrupt on either transition
    // and attach intrGpioTaster() to the interrupt
    if(pigpiod.callback(globals.pi, GPIO_TASTER_RUNTER, pigpiod.EITHER_EDGE,
         intrGpioTaster) < 0
    ) {
      logError('Failed to callback(pi, GPIO_TASTER_RUNTER)');

      return done('Failed to callback(pi, GPIO_TASTER_RUNTER)');
    }

    if(pigpiod.callback(globals.pi, GPIO_TASTER_HOCH, pigpiod.EITHER_EDGE,
         intrGpioTaster) < 0
    ) {
      logError('Failed to callback(pi, GPIO_TASTER_HOCH)');

      return done('Failed to callback(pi, GPIO_TASTER_HOCH)');
    }

    // set GPIO wind to generate an interrupt on high-to-low transitions
    // and attach wind.trigger() to the interrupt
    if(pigpiod.callback(globals.pi, GPIO_WIND, pigpiod.FALLING_EDGE,
         wind.trigger) < 0
    ) {
      logError('Failed to callback(pi, GPIO_WIND)');

      return done('Failed to callback(pi, GPIO_WIND)');
    }

    // Initialize the signal handler to properly cleanup on shutdown.
    signal.installCleanupOnStop(cleanup);

    return done(null);
  },
  done => {
    // Initialize process flags and write into the status.xml file
    status({process: 'running', mode: 'normal'}).then(done);
  },
  done => {
    doWhile(next => {
      mainLoop(next);
    }, () => {
      mainLoopStatus = 'STOPPED';
      logInfo('Terminated mainLoop');

      return done(null);
    });
  }
], err => {
  if(err) {
    logError(err);

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }

  logInfo('Terminated waterfall');
});
