'use strict';

/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable no-lonely-if */

// const fs               = require('fs');

// https://lodash.com/docs
const _                = require('lodash');
// https://www.npmjs.com/package/npid
const npid             = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtools         = require('rrdtools');
// http://momentjs.com/docs/
const moment           = require('moment');
// https://www.npmjs.com/package/promise-results
const promiseAllByKeys = require('promise-results/allKeys');
// https://www.npmjs.com/package/express
const express         = require('express');

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
const Action     = require('./action');

const {logDebug, logInfo, logError} = require('troubleshooting');

const status   = new Status();


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

// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNightAktiv    = false;
let temperatureOutside;
let sunThreshold;
let windThreshold;
let temperatureKTY;
let temperatureDHT;
let humidity;
let timerWind;
let timerSunDown;
let timerSunUp;
let weatherData;
let weatherRefreshedHour;
let nightDowntime;
let config;



// *************************************************************************
// intrGpioTaster() - Interrupt handler for Jalousie Inputs
let intrGpioTasterLastTick    = pigpiod.get_current_tick();
let intrGpioTasterTriggerTick = pigpiod.get_current_tick();
const intrGpioTaster = function(intrPi, intrGpio, intrLevel, intrTick) {
  let outDirection;
  let outLevel;
  let tasterString;
  let levelString;
//  let realLevel;
  let tickSinceLast;
  let tickSinceTrigger;

  tickSinceLast          = intrTick - intrGpioTasterLastTick;
  tickSinceTrigger       = intrTick - intrGpioTasterTriggerTick;
  intrGpioTasterLastTick = intrTick;

  switch(intrGpio) {
    case GPIO_TASTER_HOCH:
      outDirection = GPIO_JALOUSIE_HOCH;
      tasterString = 'JALOUSIE_HOCH';
      break;

    case GPIO_TASTER_RUNTER:
      outDirection = GPIO_JALOUSIE_RUNTER;
      tasterString = 'JALOUSIE_RUNTER';
      break;

    default:
      logError(`Unhandled interrupt trigger intrGpio=${intrGpio}`);

      return;
  }

  if(intrLevel) {
    levelString = 'Losgelassen';
    outLevel    = JALOUSIE_AUS;
  } else {
    levelString = 'Gedrückt';
    outLevel    = JALOUSIE_AN;
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
      pigpiod.gpio_write(intrPi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      pigpiod.gpio_write(intrPi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
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
      logInfo(`flagWindalarm unterdrueckt ` +
        `pigpiod.gpio_write(intrPi, ${outDirection}, ${outLevel})`);
    } else {
      pigpiod.gpio_write(intrPi, outDirection, outLevel);
    }
  } // Stop

  triggerTick = intrTick;

//  TODO logInfo('sleep 500ms');
//  time_sleep(0.500);
//  logInfo(`awake and exit callback ${intrTick}`);
};



const cleanup = function() {
  logInfo('Quit process\n\n\n');

  status.update({process: 'stopped'});

  if(pi) {
    pigpiod.pigpio_stop(pi);
    pi = undefined;
  }
};



let actionThread;

const startAction = function(action) {
  actionThread = new Action(action, {
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
  const pidFile = npid.create('/var/run/jalousie.pid');

  pidFile.removeOnExit();
} catch(err) {
  logDebug('Failed to open /var/run/jalousie.pid');
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
    actionThread = startAction('JALOUSIE_GANZHOCH');
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
    actionThread = startAction('JALOUSIE_GANZRUNTER');
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
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
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
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
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
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
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
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
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
    actionThread = startAction('JALOUSIE_STOP');
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
    actionThread = startAction('JALOUSIE_SCHATTEN');
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
    actionThread = startAction('JALOUSIE_WENDUNG');
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
    actionThread = startAction('JALOUSIE_ALLE_HOCH');
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
    actionThread = startAction('JALOUSIE_ALLE_RUNTER');
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
    actionThread = startAction('JALOUSIE_INDIVIDUELL');
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
    actionThread = startAction('JALOUSIE_SONDER_TEST');
    res.send('ok');
  }
});

app.listen(3000);



logInfo('-----------------------------------------------------------\n' +
       '                    Starting Jalousie mit pigpiod');

// Read the config.xml file into the globals
configFile.read().then(newConfig => {
  config = newConfig;
  // TODO eigentlich muesste ich den gesamten startup hier verzoegern.
});

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
pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
logInfo('Init: JALOUSIE_HOCH, AUS');

pigpiod.set_mode(pi, GPIO_JALOUSIE_RUNTER, pigpiod.PI_OUTPUT);
pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
logInfo('Init: JALOUSIE_RUNTER, AUS');

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
setInterval(() => {
  // Zeit holen für spätere Bedingungen auf der Uhrzeit.
  const currentTime = moment();

  // Zeit ins XML file schreiben
  status.update({time: currentTime.format('HH:mm:ss')});

  // Get the data from the various sensors
  const sensorFunctions = {
    kty81Temperature: kty81.getTemperature(pi),
    sunThreshold:     sun.getSunThreshold(pi),
    windThreshold:    wind.getWindThreshold(pi),
    vitoTemperature:  vito.getTemperature()
  };

  // read room temperature and humidity from DHT22 sensor
  // only once per minute (at seconds === 0)
  if(currentTime.second() === 0 || temperatureDHT === undefined) {
    sensorFunctions.dht22Data = pigpiod.dht(pi, 18);
  }

  if(nightDowntime === undefined ||
     (currentTime.minute() === 2 &&
      currentTime.hour() !== weatherRefreshedHour ||
      weatherData === undefined)
  ) {
    sensorFunctions.weatherData = weather.getData();
  }

  promiseAllByKeys(sensorFunctions).then(sensors => {
    // KTY81
    if(sensors.kty81) {
      temperatureKTY = sensors.kty81Temperature;
    }

    // DHT22
    if(sensors.dht22Data) {
      if(sensors.dht22Data.status === pigpiod.dht.DHT_GOOD) {
        temperatureDHT = sensors.dht22Data.temperature;
        humidity       = sensors.dht22Data.humidity;

        status.update({
          temperatureDHT:  temperatureDHT,
          humidity:        humidity,
          dht22Status:     sensors.dht22.status,
          dht22Timestamp:  sensors.dht22.timestamp // TODO moment() to format
        });
      } else {
        logInfo(
          `Failed to get data from DHT22. Status=${sensors.dht22.status}`);
      }
    }

    // Vito
    if(sensors.vitoTemperature) {
      temperatureOutside = sensors.vitoTemperature;

      status.update({temperatureOutside: temperatureOutside});
    }

    // Weather
    if(sensors.weather) {
      weatherData          = sensors.weather;
      weatherRefreshedHour = currentTime.hour();
      nightDownTime        =
        weather.getNightDownTime(weatherData, currentTime, nightDownTime);
    }

//  // Zusaetzlicher Check ueber 'haengende' Tasten.
//  if(stateTasterRunter === 0 &&
//     pigpiod.gpio_read(pi, GPIO_TASTER_RUNTER) === 1
//  ) {
//    logInfo('Haengenden Taster JALOUSIE_RUNTER gefixt');
//    pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
//    stateTasterRunter = 1;
//  }
//  if(stateTasterHoch === 0 &&
//     pigpiod.gpio_read(pi, GPIO_TASTER_HOCH) === 1
//  ) {
//    logInfo('Haengenden Taster JALOUSIE_HOCH gefixt');
//    pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
//    stateTasterHoch = 1;
//  }
//    if(pthread_kill(threads[0], 0)) {
//      // pthread_kill returned an error, so the thread is not active.
//      if(stateTasterRunter &&
//         pigpiod.gpio_read(pi, GPIO_JALOUSIE_RUNTER) === JALOUSIE_AN
//      ) {
//        logInfo('Haengenden Ausgang JALOUSIE_RUNTER gefixt');
//        pigpiod.gpio_write(pi, GPIO_TASTER_RUNTER, 0);
//        stateTasterRunter = 0;
//      }
//    }



    // Update values into rrd database
    const rrdNow  = rrdtools.nows();

    // TODO translate
    // TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )
    // TODO join the two databases
    _.forIn({
      windschwelle:     windThreshold,
      sonnenschwelle:   sunThreshold,
      temperaturKTY:    temperatureKTY,
      temperaturDHT:    temperatureDHT,
      luftfeuchtigkeit: humidity,
      temperaturAussen: temperatureOutside,
      wetterCode:       weatherData.code
    }, (key, value) => {
      rrdtools.update('/var/jalousie/jalousie.rrd', key,
        [[rrdNow, value].join(':')], err => {
          logError(err);
        });
    });

    _.forIn({
      flagSonne: flagSun,
      flagWin:   flagWindalarm
    }, (key, value) => {
      rrdtools.update('/var/jalousie/flags.rrd', key,
        [[rrdNow, value].join(':')], err => {
          logError(err);
        });
    });

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
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
          if(flagNight) {
            // TODO will ich das wirklich? nacht die jalousien unnoetig bewegen?
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

        // Alarm. Dauersignal HOCH.
        pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
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
            actionThread = startAction('JALOUSIE_GANZHOCH');
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
            actionThread = startAction('JALOUSIE_GANZRUNTER');
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
                actionThread = startAction('JALOUSIE_GANZHOCH');
              }
            } // sunThreshold <= config.sun.up.threshold
          } else { // flagSun
            if((sunThreshold >= config.sun.up.threshold) ||
               (sunThreshold >= (config.sun.down.threshold - 4) &&
                temperatureDHT >= config.temperature.down.degree)
            ) {
              if(!timerSunDown) {
                if(sunThreshold >= config.sun.down.threshold) {
                  logInfo(`sunThreshold(${sunThreshold}) >= ` +
                    `config.sun.down.threshold(${config.sun.down.threshold})`);
                } else if(sunThreshold >= (config.sun.down.threshold - 4) &&
                        temperatureDHT >= config.temperature.down.degree
                ) {
                  logInfo(`sunThreshold(${sunThreshold}) >= ` +
                    `config.sun.down.threshold(` +
                    `${config.sun.down.threshold - 4}) && ` +
                    `temperatureDHT(${temperatureDHT.toFixed(1)}) >= ` +
                    `config.temperature.down.degree(` +
                    `${config.temperature.down.degree})`);
                } else {
                  logError(`sunThreshold=${sunThreshold}, ` +
                    `temperatureDHT=${temperatureDHT.toFixed(1)}`);
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
                actionThread = startAction('JALOUSIE_SCHATTEN');
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
  });
}, 1000);
