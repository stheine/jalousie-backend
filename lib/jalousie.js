#!/usr/bin/env node
'use strict';

/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable no-lonely-if */

// https://lodash.com/docs
const _                = require('lodash');
// https://www.npmjs.com/package/npid
const npid             = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtool          = require('rrdtools');
// http://momentjs.com/docs/
const moment           = require('moment');
// https://www.npmjs.com/package/promise-results
const promiseAllByKeys = require('promise-results/allKeys');
// https://www.npmjs.com/package/express
const express         = require('express');
// https://www.npmjs.com/package/dank-do-while
const doWhile         = require('dank-do-while');

// TODO switch to git or npm installed module
// https://github.com/stheine/pigpiod
const pigpiod  = require('../../pigpiod'); // TODO

const configFile = require('./configFile');
const kty81      = require('./kty81');
const signal     = require('./signal');
const wind       = require('./wind');
const sun        = require('./sun');
const vito       = require('./vito');
const weather    = require('./weather');
const Status     = require('./status');
const Action     = require('./Action');

const {logDebug, logInfo, logError} = require('./troubleshooting');

const status   = new Status();

// TODO TODO TODO DHT sensor only works sometimes... try if I could put it into a separate promise, not executed parallel to the others, but serial...
// otherwise, need to implement in C.

// TODO process.exit() for the shutdown doesn't seem a good idea.
//      maybe I can stop the setInterval instead to make node stop the
//      whole process for an empty queue???
// TODO Automatik vs Handbetrieb. wirkt sich auf schaltzeiten(night)
//      und sonne aus.
// TODO Da möchte ich aber einen zusätzlichen modus haben,
//      der den Handbetrieb nur für die Sonne gelten lässt,
//      und nach der nächsten Schaltzeit wieder auf Automatik schaltet.
// TODO die Status Flags (Wind/ Sonne/ Auto) muss ich auch in files
//      schreiben, so dass ich bei einem Neustart darauf aufsetzen kann.

const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder

const GPIO_TASTER_RUNTER   = 22; // GPIO22, Pin15 - Input  - Taster runter
const GPIO_TASTER_HOCH     = 27; // GPIO27, Pin13 - Input  - Taster hoch
const GPIO_JALOUSIE_RUNTER =  4; // GPIO4,  Pin7  - Output - Jalousie runter
const GPIO_JALOUSIE_HOCH   = 17; // GPIO17, Pin11 - Output - Jalousie hoch


// *************************************************************************
const JALOUSIE_AN    = 1;
const JALOUSIE_AUS   = 0;



// *************************************************************************
// Globals

// Connection to pigpiod
let pi;

// Tasten
let stateTasterRunter = 1;
let stateTasterHoch   = 1;

// Flags
let flagNight         = false;
let flagSun           = false;
let flagWindalarm     = false;

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
let config;
let rrdLast;
let actionThread;




// *************************************************************************
// intrGpioTaster() - Interrupt handler for Jalousie Inputs
let intrGpioTasterLastTick;
let intrGpioTasterTriggerTick;
const intrGpioTaster = function(intrPi, intrGpio, intrLevel, intrTick) {
  let actionCommand;
  let   tasterString;
  let   levelString;

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

    if(flagWindalarm) {
      logInfo('flagWindalarm unterdrueckt JALOUSIE_STOP');
    } else {
      actionThread = startAction('JALOUSIE_AUS', actionThread);
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

    if(flagWindalarm) {
      logInfo(`flagWindalarm unterdrueckt ${actionCommand}`);
    } else {
      actionThread = startAction(actionCommand, actionThread);
    }
  } // Stop

  intrGpioTasterTriggerTick = intrTick;
};



const cleanup = function() {
  return new Promise(resolve => {
    logInfo('Quit process\n\n\n');

    mainLoopStatus = 'CANCEL';

    new Promise(resolve => {
      setInterval(() => {
        if(mainLoopStatus === 'STOPPED') {
          return resolve();
        }

        logDebug('Waiting for main loop to stop');
      }, 100);
    })
    .then(() => {
      if(pi) {
        pigpiod.pigpio_stop(pi);
        pi = undefined;
      }

      status.update({process: 'stopped'}).then(resolve());
    });
  });
};



const startAction = function(action, lastActionThread) {
  return new Action(action, lastActionThread, {
    config: config,
    gpio: {
      down: GPIO_JALOUSIE_RUNTER,
      up:   GPIO_JALOUSIE_RUNTER
    },
    pi: pi
  });
};



// *************************************************************************
// main()
try {
  const pidFile = npid.create('/var/jalousie/jalousie.pid');

  pidFile.removeOnExit();
} catch(err) {
  logDebug('Failed to open /var/jalousie/jalousie.pid');
  logError(err);
  /* eslint-disable no-process-exit */
  process.exit(1);
  /* eslint-enable no-process-exit */
}

// Start up web server
const app = express();

app.get('/configRead', (req, res) => {
  // Read configuration from file
  logInfo('Read configuration');
  configFile.read().then(newConfig => {
    config = newConfig;
    res.send('ok');
  })
  .catch(err => {
    logError(err);
    res.status(500).send(err);
  });
});

app.get('/ganzhochclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /ganzhochclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_GANZHOCH');
    // Start new thread.
    actionThread = startAction('JALOUSIE_GANZHOCH', actionThread);
    res.send('ok');
  }
});

app.get('/ganzrunterclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /ganzrunterclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_GANZRUNTER');
    // Start new thread.
    actionThread = startAction('JALOUSIE_GANZRUNTER', actionThread);
    res.send('ok');
  }
});

app.get('/hochclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /hochclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_HOCH, AN');
    actionThread.abort();
    // Hoch Click
    actionThread = startAction('JALOUSIE_HOCH_AN', actionThread);
    res.send('ok');
  }
});

app.get('/hochrelease', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /hochrelease');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_HOCH, AUS');
    actionThread.abort();
    // Hoch Release
    actionThread = startAction('JALOUSIE_HOCH_AUS', actionThread);
    res.send('ok');
  }
});

app.get('/runterclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /runterclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_RUNTER, AN');
    actionThread.abort();
    // Runter Click
    actionThread = startAction('JALOUSIE_RUNTER_AN', actionThread);
    res.send('ok');
  }
});

app.get('/runterrelease', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /runterrelease');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_RUNTER, AUS');
    actionThread.abort();
    // Runter Release
    actionThread = startAction('JALOUSIE_RUNTER_AUS', actionThread);
    res.send('ok');
  }
});

app.get('/stopclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /stopclick');
    res.send('windalarm');
  } else {
    logInfo('Stop: JALOUSIE_HOCH, AN, 140ms, AUS');
    actionThread.abort();
    actionThread = startAction('JALOUSIE_STOP', actionThread);
    actionThread.then(() => {
      res.send('ok');
    })
    .catch(err => {
      res.send(err);
    });
  }
});

app.get('/schattenclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /schattenclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_SCHATTEN');
    // Start new thread.
    actionThread = startAction('JALOUSIE_SCHATTEN', actionThread);
    res.send('ok');
  }
});

app.get('/wendungclick', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /wendungclick');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_WENDUNG');
    // Start new thread.
    actionThread = startAction('JALOUSIE_WENDUNG', actionThread);
    res.send('ok');
  }
});

app.get('/allehoch', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /allehoch');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_ALLE_HOCH');
    // Start new thread.
    actionThread = startAction('JALOUSIE_ALLE_HOCH', actionThread);
    res.send('ok');
  }
});

app.get('/allerunter', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /allerunter');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_ALLE_RUNTER');
    // Start new thread.
    actionThread = startAction('JALOUSIE_ALLE_RUNTER', actionThread);
    res.send('ok');
  }
});

app.get('/individuell', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /individuell');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_INDIVIDUELL');
    // Start new thread.
    actionThread = startAction('JALOUSIE_INDIVIDUELL', actionThread);
    res.send('ok');
  }
});

app.get('/sonder', (req, res) => {
  if(flagWindalarm) {
    logInfo('flagWindalarm unterdrueckt /sonder');
    res.send('windalarm');
  } else {
    logInfo('JALOUSIE_SONDER_TEST');
    // Start new thread.
    actionThread = startAction('JALOUSIE_SONDER_TEST', actionThread);
    res.send('ok');
  }
});

app.listen(3000);



logInfo('-----------------------------------------------------------\n' +
       '                    Starting Jalousie mit pigpiod');

// Initialize process flags and write into the status.xml file
status.update({process: 'running', mode: 'normal'});

// sets up the pigpio library
pi = pigpiod.pigpio_start();
if(pi < 0) {
  logError('Failed to pigpiod.pigpio_start()');

  throw new Error('Failed to pigpiod.pigpio_start()'); // TODO throw or exit?
}

// initialize GPIO for Jalousie
// input, pull-up
pigpiod.set_mode(pi, GPIO_TASTER_RUNTER, pigpiod.PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_TASTER_RUNTER, pigpiod.PI_PUD_UP);
pigpiod.set_glitch_filter(pi, GPIO_TASTER_RUNTER, 50);

pigpiod.set_mode(pi, GPIO_TASTER_HOCH, pigpiod.PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_TASTER_HOCH, pigpiod.PI_PUD_UP);
pigpiod.set_glitch_filter(pi, GPIO_TASTER_HOCH, 50);

pigpiod.set_mode(pi, GPIO_WIND, pigpiod.PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_WIND, pigpiod.PI_PUD_UP);

// output, init 0 -> Transistor open -> Jalousie pull-up remains on 5V.
pigpiod.set_mode(pi, GPIO_JALOUSIE_HOCH, pigpiod.PI_OUTPUT);
pigpiod.set_mode(pi, GPIO_JALOUSIE_RUNTER, pigpiod.PI_OUTPUT);

logInfo('Init: JALOUSIE_AUS');
actionThread = startAction('JALOUSIE_AUS', actionThread);

// set GPIO inputs to generate an interrupt on either transition
// and attach intrGpioTaster() to the interrupt
if(pigpiod.callback(pi, GPIO_TASTER_RUNTER, pigpiod.EITHER_EDGE,
     intrGpioTaster) < 0
) {
  logError('Failed to callback(pi, GPIO_TASTER_RUNTER)');

  throw new Error('Failed to callback(pi, GPIO_TASTER_RUNTER)');
}

if(pigpiod.callback(pi, GPIO_TASTER_HOCH, pigpiod.EITHER_EDGE,
     intrGpioTaster) < 0
) {
  logError('Failed to callback(pi, GPIO_TASTER_HOCH)');

  throw new Error('Failed to callback(pi, GPIO_TASTER_HOCH)');
}

// set GPIO wind to generate an interrupt on high-to-low transitions
// and attach wind.trigger() to the interrupt
if(pigpiod.callback(pi, GPIO_WIND, pigpiod.FALLING_EDGE, wind.trigger) < 0) {
  logError('Failed to callback(pi, GPIO_WIND)');

  throw new Error('Failed to callback(pi, GPIO_WIND)');
}

// Initialize the signal handler to properly cleanup on shutdown.
signal.installCleanupOnStop(cleanup);



// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
const mainLoop = function(next) {
  logDebug('Start main loop');

  new Promise(resolve => {
    // Zeit holen für spätere Bedingungen auf der Uhrzeit.
    const currentTime = moment();

    // Trigger startup of the various asynchronous functions
    const asyncFunctions = {};

    // Read the config.xml file into the globals
    if(!config) {
      logDebug('get config');
      asyncFunctions.config = configFile.read();
    }

    if(config &&
              ((currentTime.minute() === 0 &&
                currentTime.hour() !== weatherRefreshedHour) ||
               nightDownTime === undefined ||
               weatherData === undefined)
    ) {
      logDebug('get weather');
      asyncFunctions.weather = weather.getData(config);
    }

    if(currentTime.second() === 30 || temperatureDht === undefined) {
      // Get the room temperature and humidity from DHT22 sensor
      // only once per minute (at seconds === 30), since the sensor data
      // cannot be pulled every second.
      logDebug('get dht22');
      asyncFunctions.dht22 = pigpiod.dht(pi, 18);
    }

    // Write the current time into the status file
    asyncFunctions.timeToStatus = status.update({
      time: currentTime.format('HH:mm:ss')});

    // Get the wind threshold
    asyncFunctions.windThreshold = wind.getThreshold(pi);

    // Get the sun threshold
    asyncFunctions.sunThreshold = sun.getThreshold(pi);

    // Get the outside temperature from the Vito
    asyncFunctions.vitoTemperature =  vito.getTemperature();

    // Get the room temperature from the KTY81 sensor
    asyncFunctions.kty81Temperature = kty81.getTemperature(pi);

    promiseAllByKeys(asyncFunctions).then(data => {
      // Config
      if(data.config) {
        config = data.config;
      }

      if(!config) {
        logError('Failed to read configuration. Exiting.');
        /* eslint-disable no-process-exit */
        process.exit(2);
        /* eslint-enable no-process-exit */
      }

      // Wind
      if(data.windThreshold) {
        // TODO TODO warum passiert das hier nicht???
        windThreshold = data.windThreshold.threshold;

        status.update({
          windThreshold: data.windThreshold.threshold
        });
      }

      // Sun
      if(data.sunThreshold) {
        sunThreshold = data.sunThreshold.threshold;

        status.update({
          sunThreshold: data.sunThreshold.threshold
        });
      }

      // Vito
      if(data.vitoTemperature) {
        temperatureOutside = data.vitoTemperature.temperatureOutside;

        status.update({
          temperatureOutside: data.vitoTemperature.temperatureOutside
        });
      }

      // KTY81
      if(data.kty81) {
        temperatureKty = data.kty81Temperature.temperature;

        status.update({
          temperatureKty: data.kty81Temperature.temperature
        });
      }

      // DHT22
      if(data.dht22) {
        if(data.dht22.status === pigpiod.DHT_GOOD) {
          temperatureDht = data.dht22.temperature;
          humidity       = data.dht22.humidity;

          status.update({
            temperatureDht:  temperatureDht,
            humidity:        humidity,
            dht22Status:     data.dht22.status,
            dht22Timestamp:  data.dht22.timestamp.format('HH:mm:ss')
          });
        } else {
          logInfo(
            `Failed to get data from DHT22. Status=${data.dht22.status}`);
          status.update({
            dht22Status:     data.dht22.status
          });
        }
      }

      // Weather
      if(data.weather) {
        weatherData          = data.weather;
        weatherCode          = data.weather.code;
        weatherRefreshedHour = currentTime.hour();
        nightDownTime        =
          weather.getNightDownTime(data.weather, currentTime, nightDownTime);
        status.update({
          weatherCode:   data.weather.code,
          weatherText:   data.weather.text,
          sunrise:       data.weather.sunrise.format('HH:mm'),
          sunset:        data.weather.sunset.format('HH:mm'),
          nightDownTime: nightDownTime.format('HH:mm')
        });
      }

      if(!weatherData || !nightDownTime) {
        logInfo('No weather data yet. Skip further processing.');

        return resolve();
      }



      // Update values into rrd database
      // TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )
      const rrdNow    = rrdtool.nows();
      // If I have already updated the rrd database in this second,
      // skip this update, since rrd does not accept multiple updates
      // per second.
      if(!rrdLast || rrdNow > (rrdLast + 1)) {
        const rrdUpdates = {
          windThreshold:      windThreshold,
          sunThreshold:       sunThreshold,
          temperatureKty:     temperatureKty,
          temperatureDht:     temperatureDht,
          humidity:           humidity,
          temperatureOutside: temperatureOutside,
          weatherCode:        weatherCode,
          flagSun:            flagSun,
          flagWindalarm:      flagWindalarm,
          flagNight:          flagNight
        };
        const rrdFile   = '/var/jalousie/jalousie.rrd';
        const rrdValues = [rrdNow];

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

            return resolve();
          }
        });
      }



      // so, jetzt habe ich die werte und kann darauf reagieren.
      if(flagWindalarm) {
        // TODO im original gibt es noch die Bedingung
        // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
        // ohne Verzoegerung.
        if(windThreshold < config.wind.up.threshold) {
          if(!timerWind) {
            logInfo(`windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${config.wind.up.threshold})`);
            logInfo('Start timerWind');
            timerWind = moment.utc();
          } else if(moment.utc().diff(timerWind, 'minutes') > 10) {
            logInfo(`windThreshold(${windThreshold}) < ` +
              `config.wind.up.threshold(${config.wind.up.threshold})`);
            logInfo('moment().diff(timerWind) > 10min');
            flagWindalarm = false;
            logInfo('flagWindalarm = false');
            timerWind = undefined;

            status.update({mode: 'zurueck'}); // TODO was war vorher? => normal

            // Alarm abschalten.
            actionThread = startAction('JALOUSIE_AUS', actionThread);
            if(flagNight) {
              // TODO will ich das wirklich? nachts die jalousien unnoetig bewegen?
              //      vielleicht besser noch zeitlich einschraenken...

              // TODO
              // Jalousien wieder auf den vorigen Stand bringen
              //   - impuls runter
              //   - warten bis sicher unten
            } // flagNight
          }
        }
      } else { // flagWindalarm
        if(windThreshold >= config.wind.up.threshold) {
          logInfo(`windThreshold(${windThreshold}) >= ` +
            `config.wind.up.threshold(${config.wind.up.threshold})`);
          flagWindalarm  = true;
          logInfo('flagWindalarm = true');
          status.update({mode: 'Windalarm'});

          // Wenn wirklich noch Sonne ist, gehen die Jalousien
          // ja bald wieder runter.
          flagSun = false;
          timerSunDown = undefined;

          // To alarm, signal up and leave the level there.
          actionThread = startAction('JALOUSIE_HOCH_AN', actionThread);
        } else { // windThreshold >= config.wind.up.threshold
          if(currentTime.hour()   === config.night.up.hour &&
             currentTime.minute() === config.night.up.minute
          ) {
            // Night Hoch - morgens
            if(!flagNightAktiv) {
              flagNightAktiv = true;

              logInfo(`config.night.up(` +
                `${_.padStart(config.night.up.hour, 2, 0)}:` +
                `${_.padStart(config.night.up.minute, 2, 0)})`);
              flagNight = false;
              logInfo('flagNight = false');

              // If there is a running thread, stop
              actionThread.abort();
              // Start new thread.
              actionThread = startAction('JALOUSIE_GANZHOCH', actionThread);
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
              flagNight = true;
              logInfo('flagNight = true');

              // If there is a running thread, stop
              actionThread.abort();
              // Start new thread.
              actionThread = startAction('JALOUSIE_GANZRUNTER', actionThread);
            }
          } else { // Night
            flagNightAktiv = false;

            if(flagSun) {
              if(sunThreshold <= config.sun.up.threshold) {
                if(!timerSunUp) {
                  logInfo(`sunThreshold(${sunThreshold}) <= ` +
                    `config.sun.up.threshold(${config.sun.up.threshold})`);
                  logInfo('Start timerSunUp');
                  timerSunUp = moment.utc();
                } else if(moment.utc().diff(timerSunUp, 'minutes') >=
                            config.sun.up.delayMinutes
                ) {
                  logInfo(`sunThreshold(${sunThreshold}) <= ` +
                    `config.sun.up.threshold(${config.sun.up.threshold})`);
                  logInfo(`moment().diff(timerSunUp) >= ` +
                    `${config.sun.up.delayMinutes}min`);
                  flagSun = false;
                  logInfo('flagSun = false');
                  timerSunUp = undefined;

                  // If there is a running thread, stop
                  actionThread.abort();
                  // Start new thread.
                  actionThread = startAction('JALOUSIE_GANZHOCH', actionThread);
                }
              } // sunThreshold <= config.sun.up.threshold
            } else { // flagSun
              if((sunThreshold >= config.sun.up.threshold) ||
                 (sunThreshold >= (config.sun.down.threshold - 4) &&
                  temperatureDht >= config.temperature.down.degree)
              ) {
                if(!timerSunDown) {
                  if(sunThreshold >= config.sun.down.threshold) {
                    logInfo(`sunThreshold(${sunThreshold}) >= ` +
                      `config.sun.down.threshold(${config.sun.down.threshold})`);
                  } else if(sunThreshold >= (config.sun.down.threshold - 4) &&
                          temperatureDht >= config.temperature.down.degree
                  ) {
                    logInfo(`sunThreshold(${sunThreshold}) >= ` +
                      `config.sun.down.threshold(` +
                      `${config.sun.down.threshold - 4}) && ` +
                      `temperatureDht(${temperatureDht.toFixed(1)}) >= ` +
                      `config.temperature.down.degree(` +
                      `${config.temperature.down.degree})`);
                  } else {
                    logError(`sunThreshold=${sunThreshold}, ` +
                      `temperatureDht=${temperatureDht.toFixed(1)}`);
                  }
                  logInfo('Start timerSunDown');
                  timerSunDown = moment.utc();
                } else if(moment.utc().diff(timerSunDown, 'minutes') >=
                            config.sun.down.delayMinutes
                ) {
                  logInfo(`sunThreshold(${sunThreshold}) >= ` +
                    `config.sun.down.threshold(${config.sun.down.threshold})`);
                  logInfo(`moment().diff(timerSunDown) >= ` +
                    `${config.sun.down.delayMinutes}min`);
                  flagSun = true;
                  logInfo('flagSun = true');
                  timerSunDown = undefined;

                  // If there is a running thread, stop
                  actionThread.abort();
                  // Start new thread.
                  actionThread = startAction('JALOUSIE_SCHATTEN', actionThread);
                }
              } else { // sunThreshold >= config.sun.down.threshold
                // Timer zuruecksetzen
                if(timerSunDown) {
                  logInfo(`sunThreshold(${sunThreshold}) < ` +
                    `config.sun.down.threshold(${config.sun.down.threshold})`);
                  timerSunDown = undefined;
                }
              } // sunThreshold >= config.sun.down.threshold
            } // flagSun
          } // Night
        } // windThreshold >= config.sun.up.threshold
      } // flagWindalarm

      status.update({
        flagNight:        flagNight,
        flagSun:          flagSun,
        flagWindalarm:    flagWindalarm,

        timerSunUp:
          moment.utc(moment.utc().diff(timerSunUp)).format('HH:mm:ss'),
        timerSunDown:
          moment.utc(moment.utc().diff(timerSunDown)).format('HH:mm:ss'),
        timerWind:
          moment.utc(moment.utc().diff(timerWind)).format('HH:mm:ss')
      });

      return resolve();
    })
    .catch(err => {
      logError(err);
      /* eslint-disable no-process-exit */
      process.exit(3);
      /* eslint-enable no-process-exit */
    });
  })
  .then(() => {
    if(['STARTUP', 'RUNNING'].includes(mainLoopStatus)) {
      setTimeout(() => {
        return next(true);
      }, 1000);
    } else {
      return next(false);
    }
  });
};



doWhile(next => {
  mainLoop(next);
}, () => {
  mainLoopStatus = 'STOPPED';
  logInfo('Terminated mainLoop');
});
