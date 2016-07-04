'use strict';

const fs       = require('fs');

// https://www.npmjs.com/package/npid
const npid     = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtools = require('rrdtools');
// http://momentjs.com/docs/
const moment   = require('moment');
// https://www.npmjs.com/package/promise-results
const promiseAllByKeys = require('promise-results/allKeys');

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const kty81    = require('./kty81');
const signal   = require('./signal');
const wind     = require('./wind');
const sun      = require('./sun');
const vito     = require('./vito');
const weather  = require('./weather');
const Status   = require('./status');

const {logDebug, logInfo, logError} = require('troubleshooting');

const status   = new Status();


// TODO Alle messwerte ins rrdtool schreiben.
// TODO Automatik vs Handbetrieb. wirkt sich auf schaltzeiten(night) und sonne aus.
// TODO Da möchte ich aber einen zusätzlichen modus haben, der den Handbetrieb nur für die Sonne gelten lässt,
//      und nach der nächsten Schaltzeit wieder auf Automatik schaltet.
// TODO die Status Flags (Wind/ Sonne/ Auto) muss ich auch in files schreiben, so dass ich bei einem Neustart darauf aufsetzen kann.

const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder

const GPIO_TASTER_RUNTER   = 22; // GPIO22, Pin15 - Input  - Taster runter
const GPIO_TASTER_HOCH     = 27; // GPIO27, Pin13 - Input  - Taster hoch
const GPIO_JALOUSIE_RUNTER =  4; // GPIO4,  Pin7  - Output - Jalousie runter
const GPIO_JALOUSIE_HOCH   = 17; // GPIO17, Pin11 - Output - Jalousie hoch



// *********************************************************************************
// Globals

// Connection to pigpiod
let pi;

// Tasten
let stateTasterRunter      = 1;
let stateTasterHoch        = 1;

// Flags
let flagNight         = false;
let flagSun              = false;
let flagWindalarm          = false;

// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagNightAktiv    = false;



// *********************************************************************************
const JALOUSIE_AN          = 1;
const JALOUSIE_AUS         = 0;



// *********************************************************************************
const JALOUSIE_GANZHOCH    =  1;
const JALOUSIE_GANZRUNTER  =  2;
const JALOUSIE_SCHATTEN    =  3;
const JALOUSIE_WENDUNG     =  4;
const JALOUSIE_INDIVIDUELL = 10;
const JALOUSIE_ALLE_RUNTER = 11;
const JALOUSIE_ALLE_HOCH   = 12;
const JALOUSIE_SONDER_TEST = 20;

const jalousieAction = function(action) {
  switch(action) {
    case JALOUSIE_GANZHOCH:
      logMsg("jalousieAction GanzHoch: JALOUSIE_HOCH, AN, 3sek, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
      time_sleep(3); // 3 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      break;

    case JALOUSIE_GANZRUNTER:
      logMsg("jalousieAction GanzRunter: JALOUSIE_RUNTER, AN, 3sek, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(3); // 3 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      break;

    case JALOUSIE_SCHATTEN:
      logMsg(
        "jalousieAction Schatten - 1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(3); // 3 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      if(configSonneRunterPosition > 3) {
        time_sleep((configSonneRunterPosition - 3)); // Sekunden
      }
      logMsg("jalousieAction Schatten - 2 Wendung: JALOUSIE_HOCH, AN, %dms, AUS",
        configSonneRunterWendung);
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
      time_sleep(configSonneRunterWendung / 1000.0); // Millisekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      logMsg("jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, 140ms, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN); // Stop
      time_sleep(0.140); // 140ms
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      break;

    case JALOUSIE_WENDUNG:
      logMsg(
        "jalousieAction Wendung - 1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(3); // 3 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      logMsg("jalousieAction Wendung - 2 Wendung: JALOUSIE_HOCH, AN, %dms, AUS",
        configSonneRunterWendung);
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
      time_sleep(configSonneRunterWendung / 1000.0); // Millisekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      logMsg("jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, 140ms, AUS");
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN); // Stop
      time_sleep(0.140); // 140ms
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      break;

    case JALOUSIE_INDIVIDUELL:
      // Bringt die auf Automatik eingestellten Jalousien auf ihre
      // individuellen Schattenpositionen, nicht auf die zentral konfigurierte.
      logMsg("jalousieAction Individuell");

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(0.200); // 200ms
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);

      time_sleep(0.200); // 200ms

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(0.200); // 200ms
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);

      break;

    case JALOUSIE_ALLE_RUNTER:
      // Bringt ueber die Alarmfunktion alle Jalousien nach unten.
      logMsg("jalousieAction Alle Runter");

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(5); // 5 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      break;

    case JALOUSIE_ALLE_HOCH:
      // Bringt ueber die Alarmfunktion alle Jalousien nach oben.
      logMsg("jalousieAction Alle Hoch");

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
      time_sleep(5); // 5 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      break;

    case JALOUSIE_SONDER_TEST:
      logMsg("jalousieAction Sondertest");

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
      time_sleep(5); // 5 Sekunden
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
      break;

    default:
      logError("Unhandled jalousieAction=%d", actionPtr);
      break;
  }
}



// *********************************************************************************
// intrGpioTaster() - Interrupt handler for Jalousie Inputs
let intrGpioTasterLastTick    = pigpiod.get_current_tick();
let intrGpioTasterTriggerTick = pigpiod.get_current_tick();
const intrGpioTaster = function(pi, userGpio, level, tick) {
  let outDirection;
  let outLevel;
  let tasterString;
  let levelString;
  let realLevel;
  let tickSinceLast;
  let tickSinceTrigger;

  tickSinceLast          = tick - intrGpioTasterLastTick;
  tickSinceTrigger       = tick - intrGpioTasterTriggerTick;
  intrGpioTasterLastTick = tick;

  switch(userGpio) {
    case GPIO_TASTER_HOCH:
      outDirection = GPIO_JALOUSIE_HOCH;
      tasterString = "JALOUSIE_HOCH";
      break;

    case GPIO_TASTER_RUNTER:
      outDirection = GPIO_JALOUSIE_RUNTER;
      tasterString = "JALOUSIE_RUNTER";
      break;

    default:
      logError("Unhandled interrupt trigger userGpio=%d", userGpio);
      return;
  }

  if(level) {
    levelString = "Losgelassen";
    outLevel    = JALOUSIE_AUS;
  } else {
    levelString = "Gedrückt";
    outLevel    = JALOUSIE_AN;
  }

  // War dies die Stop Taste? Diese laesst fix nach ~140ms los,
  // daher kann ich sie beim Loslassen recht gut erkennen.
  if(level &&
     tickSinceTrigger > 140000 && tickSinceTrigger < 150000
  ) {
    // Stop
    logMsg("Taster JALOUSIE_STOP, %s %d", levelString, tickSinceTrigger);
    stateTasterHoch   = 1;
    stateTasterRunter = 1;

    if(flagWindalarm) {
      logMsg("flagWindalarm unterdrueckt JALOUSIE_STOP");
    } else {
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
      pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
    }
  } else { // Stop
    // Logik um falsche Interrupts zu unterdruecken.
    // Prellende Tasten.
    if(tickSinceLast < 100000) {
      // Mehrere Tastendruecke innerhalb 0.5 Sekunde. Prellt.

      // within debounceTime limit
//      if(tickSinceLast > 1000) {
//        // log the longer ones only
//        logMsg("debounce (%s, %s) %d %zu", tasterString, levelString,
//          tickSinceLast, tick);
//      }
      return;
    }
//    else {
//      time_sleep(0.000050) // 50us
// TODO    }



    // 'Taster Losgelassen', obwohl er noch gedrueckt ist, nach ~280ms.
    if(level &&
       tickSinceLast > 260000 && tickSinceLast < 300000
    ) {
      // Hier warte ich lieber mal kurz und frage den echten Wert nochmal ab.
      time_sleep(0.000100); // 100us
      realLevel = pigpiod.gpio_read(pi, userGpio);
      if(realLevel != level) {
        logMsg("additional debounce (%s, %s) %d", tasterString, levelString,
          tickSinceLast);
        return;
      } else {
        logMsg("tja (%s, %s) %d", tasterString, levelString,
          tickSinceLast);
      }
    }



    // Phantom Interrupts, auf den Wert, auf dem die Taste sowieso schon steht.
    if(userGpio === GPIO_TASTER_HOCH) {
      if(stateTasterHoch === level) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        logMsg("phantom (%s, %s) %d", tasterString, levelString, tickSinceLast);
        return;
      }
      stateTasterHoch = level;
//      stateTasterHoch = pigpiod.gpio_read(pi, GPIO_TASTER_HOCH);
    } else if(userGpio === GPIO_TASTER_RUNTER) {
      if(stateTasterRunter === level) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        logMsg("phantom (%s, %s) %d", tasterString, levelString, tickSinceLast);
        return;
      }
      stateTasterRunter = level;
//      stateTasterRunter = pigpiod.gpio_read(pi, GPIO_TASTER_RUNTER);
    }


    // Jetzt kann ich die Tastendruck weitergeben.

    logDebug("intrGpioTaster(%d, %d) realLevel=%d", userGpio, level, pigpiod.gpio_read(pi, userGpio));
    logInfo("intrGpioTaster(%d, %d) realLevel=%d", userGpio, level, pigpiod.gpio_read(pi, userGpio));
    logInfo("intrGpioTaster(%d, %d)", userGpio, level);

    logInfo("Taster %s, %s %d", tasterString, levelString, tickSinceLast);

    if(flagWindalarm) {
      logMsg("flagWindalarm unterdrueckt pigpiod.gpio_write(pi, d, %d)", outDirection,
        outLevel);
    } else {
      pigpiod.gpio_write(pi, outDirection, outLevel);
    }
  } // Stop

  triggerTick = tick;

//  logMsg("sleep 500ms");
//  time_sleep(0.500);
//  logMsg("awake and exit callback %zu", tick);
}



// *********************************************************************************
// signal handler

/* TODO das muss ich ganz anders machen. express oder so.
static void signalHandler(int signal, siginfo_t *siginfo, void *context) {
  FILE *actionHandle;
  char actionBuffer[100];
  char actionCmd[100];
  int action;

  switch(signal) {
    case SIGUSR1:
      logDebug("SIGUSR1");

      actionHandle = fopen("/var/jalousie/action.dat", "r");
      if (actionHandle === NULL) {
        logError("Failed to open action.dat");
        return;
      }
      fgets(actionBuffer, sizeof(actionBuffer), actionHandle);
      fclose(actionHandle);
      actionBuffer[sizeof(actionBuffer) - 1] = 0;
      sscanf(actionBuffer, "%s", actionCmd);
      logDebug("SIGUSR1: '%s'/'%s'", actionBuffer, actionCmd);
      if(strcasecmp(actionCmd, "config") === 0) {
        // Config neu einlesen
        logMsg("Config");
        readConfig();
      } else if(flagWindalarm) {
        logMsg("flagWindalarm unterdrueckt actionCmd '%s'", actionCmd);
      } else {
        if(strcasecmp(actionCmd, "ganzhochclick") === 0) {
          logMsg("JALOUSIE_GANZHOCH");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_GANZHOCH;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "hochclick") === 0) {
          logMsg("JALOUSIE_HOCH, AN");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Hoch Click
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
        } else if(strcasecmp(actionCmd, "hochrelease") === 0) {
          logMsg("JALOUSIE_HOCH, AUS");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Hoch Release
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);

        } else if(strcasecmp(actionCmd, "stopclick") === 0) {
          logMsg("Stop: JALOUSIE_HOCH, AN, 140ms, AUS");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Stop Click
          // Der originale Aerotec merkt sich die letzte Bewegungsrichtung
          // und triggert den Stop in die Gegenrichtung.
          // Ist aber nicht noetig, auch mit immer HOCH stoppt er jedes mal.
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN);
          time_sleep(0.140); // 140ms
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
  //      } else if(strcasecmp(actionCmd, "stoprelease") === 0) {
  //        // Stop Release
  //        // hier muss ich nichts tun.

        } else if(strcasecmp(actionCmd, "runterclick") === 0) {
          logMsg("JALOUSIE_RUNTER, AN");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Runter Click
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AN);
        } else if(strcasecmp(actionCmd, "runterrelease") === 0) {
          logMsg("JALOUSIE_RUNTER, AUS");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Runter Release
          pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);

        } else if(strcasecmp(actionCmd, "ganzrunterclick") === 0) {
          logMsg("JALOUSIE_GANZRUNTER");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_GANZRUNTER;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "schattenclick") === 0) {
          logMsg("JALOUSIE_SCHATTEN");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_SCHATTEN;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "wendungclick") === 0) {
          logMsg("JALOUSIE_WENDUNG");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_WENDUNG;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);



        } else if(strcasecmp(actionCmd, "allehoch") === 0) {
          logMsg("JALOUSIE_ALLE_HOCH");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_ALLE_HOCH;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "allerunter") === 0) {
          logMsg("JALOUSIE_ALLE_RUNTER");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_ALLE_RUNTER;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "individuell") === 0) {
          logMsg("JALOUSIE_INDIVIDUELL");
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_INDIVIDUELL;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else if(strcasecmp(actionCmd, "sonder") === 0) {
          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_SONDER_TEST;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);

        } else {
          logError("Unhandled actionCmd '%s'", actionCmd);
        }
      }
      break;

  }
}
*/



const cleanup = function() {
  logInfo("Quit process\n\n\n");

  status.update({process: 'stopped'});

  if(pi) {
    pigpiod.pigpio_stop(pi);
    pi = undefined;
  }
};



// *********************************************************************************
// main()
let temperatureOutside;
let sunThreshold;
let windThreshold;
let temperatureKTY;
let temperatureDHT;
let humidity;
let timerWind;
let timerSunDown;
let timerSunUp;
let action;
let weatherRefreshedHour;
let rrdData[100];
let rrdParams[4];
let calcRunterStunden;
let calcRunterMinuten;
let wetterLabel;

try {
  const pidFile = npid.create('/var/run/jalousie.pid');
  pidFile.removeOnExit();
} catch(err) {
  logDebug('Failed to open /var/run/jalousie.pid');
  console.log(err);
  process.exit(1);
}

logMsg("-----------------------------------------------------------\n"
       "                    Starting Jalousie mit pigpiod");

// Read the config.xml file into the globals
readConfig();

// Initialize process flags and write into the status.xml file
status.update({process: 'running', mode: 'normal'});

// sets up the pigpio library
if((pi = pigpio_start(NULL, NULL)) < 0) {
  logError("Failed to pigpio_start()");
  return(1);
}

// initialize GPIO for Jalousie
// input, pull-up
pigpiod.set_mode(pi, GPIO_TASTER_RUNTER, PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_TASTER_RUNTER, PI_PUD_UP);
pigpiod.set_glitch_filter(pi, GPIO_TASTER_RUNTER, 50);

pigpiod.set_mode(pi, GPIO_TASTER_HOCH, PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_TASTER_HOCH, PI_PUD_UP);
pigpiod.set_glitch_filter(pi, GPIO_TASTER_HOCH, 50);

pigpiod.set_mode(pi, GPIO_WIND, PI_INPUT);
pigpiod.set_pull_up_down(pi, GPIO_WIND, PI_PUD_UP);

// output, init 0 -> Transistor open -> Jalousie pull-up remains on 5V.
pigpiod.set_mode(pi, GPIO_JALOUSIE_HOCH, PI_OUTPUT);
pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
logMsg("Init: JALOUSIE_HOCH, AUS");

pigpiod.set_mode(pi, GPIO_JALOUSIE_RUNTER, PI_OUTPUT);
pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
logMsg("Init: JALOUSIE_RUNTER, AUS");

// set GPIO inputs to generate an interrupt on either transition
// and attach intrGpioTaster() to the interrupt
if(pigpiod.callback(pi, GPIO_TASTER_RUNTER, EITHER_EDGE, &intrGpioTaster) < 0) {
  logError("Failed to callback(pi, GPIO_TASTER_RUNTER)");
  return(1);
}

if(pigpiod.callback(pi, GPIO_TASTER_HOCH, EITHER_EDGE, &intrGpioTaster) < 0) {
  logError("Failed to callback(pi, GPIO_TASTER_HOCH)");
  return(1);
}

// set GPIO wind to generate an interrupt on high-to-low transitions
// and attach wind.trigger() to the interrupt
if(pigpiod.callback(pi, GPIO_WIND, FALLING_EDGE, wind.trigger) < 0) {
  logError("Failed to callback(pi, GPIO_WIND)");
  return(1);
}

// Initialize the signal handler to properly cleanup on shutdown.
signal.installCleanupOnStop(cleanup);



// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
setInterval(() => {
  // Zeit holen für spätere Bedingungen auf der Uhrzeit.
  const currentTime = moment();

  // Zeit ins XML file schreiben
  status.update({time: currentTime.format('HH:mm:ss'});

  // Get the data from the various sensors
  const sensorFunctions = {
    kty81Temperature: kty81.getTemperature(pi),
    sunThreshold:     sun.getSunThreshold(pi),
    windThreshold:    wind.getWindThreshold(pi)
    vitoTemperature:  vito.getTemperature()
    // TODO wetter
  };

  // read room temperature and humidity from DHT22 sensor
  // only once per minute (at seconds === 0)
  if(currentTime.second() === 0 || temperatureDHT === undefined) {
    sensorFunctions.dht22Data = pigpiod.dht(pi, 18);
  }

  if((calcRunterStunden === undefined) ||
     (calcRunterMinuten === undefined) ||
     (currentTime.minute() === 2 &&
      currentTime.hour() !== weatherRefreshedHour)
  ) {
    sensorFunctions.weatherData = weather.getNightTime();
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
        logMsg(
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
      weatherRefreshedHour = currentTime.hour()
    }

//  // Zusaetzlicher Check ueber 'haengende' Tasten.
//  if(stateTasterRunter === 0 &&
//     pigpiod.gpio_read(pi, GPIO_TASTER_RUNTER) === 1
//  ) {
//    logMsg("Haengenden Taster JALOUSIE_RUNTER gefixt");
//    pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
//    stateTasterRunter = 1;
//  }
//  if(stateTasterHoch === 0 &&
//     pigpiod.gpio_read(pi, GPIO_TASTER_HOCH) === 1
//  ) {
//    logMsg("Haengenden Taster JALOUSIE_HOCH gefixt");
//    pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
//    stateTasterHoch = 1;
//  }
//    if(pthread_kill(threads[0], 0)) {
//      // pthread_kill returned an error, so the thread is not active.
//      if(stateTasterRunter &&
//         pigpiod.gpio_read(pi, GPIO_JALOUSIE_RUNTER) === JALOUSIE_AN
//      ) {
//        logMsg("Haengenden Ausgang JALOUSIE_RUNTER gefixt");
//        pigpiod.gpio_write(pi, GPIO_TASTER_RUNTER, 0);
//        stateTasterRunter = 0;
//      }
//    }


// TODO rrd  // Messwerte in rrd speichern fuer die graphische Ausgabe
//  sprintf(rrdData,
//    "N:%d:%d:%4.1f:%2.1f:%2.1f:%4.1f:%d",
//    windThreshold,
//    sunThreshold,
//    temperatureKTY,
//    temperatureDHT,
//    humidity,
//    temperatureOutside,
//    wetterCode);
//  rrdParams[0] = "rrdupdate";
//  rrdParams[1] = "/var/jalousie/jalousie.rrd";
//  rrdParams[2] = rrdData;
//  rrdParams[3] = NULL;
//  rrd_clear_error();
//  rrd_update(3, rrdParams);
//  if(rrd_test_error() != 0) {
//    logError("rrd_update(%s) failed with %s\n", rrdData, rrd_get_error());
//    // don't stop here
//  }

//  sprintf(rrdData,
//    "N:%d:%d",
//    flagSun,
//    flagWindalarm);
//  rrdParams[0] = "rrdupdate";
//  rrdParams[1] = "/var/jalousie/flags.rrd";
//  rrdParams[2] = rrdData;
//  rrdParams[3] = NULL;
//  rrd_clear_error();
//  rrd_update(3, rrdParams);
//  if(rrd_test_error() != 0) {
//    logError("rrd_update(%s) failed with %s\n", rrdData, rrd_get_error());
//    // don't stop here
//  }



    // so, jetzt habe ich die werte und kann darauf reagieren.
    if(flagWindalarm) {
      // TODO im original gibt es noch die Bedingung
      // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
      // ohne Verzoegerung.
      if(windThreshold < configWindHochSchwelle) {
        if(!timerWind) {
          logMsg("windThreshold(%d) < configWindHochSchwelle(%d)", windThreshold,
            configWindHochSchwelle);
          logMsg("Start timerWind");
          timerWind = moment.utc();
        } else if((moment.utc().diff(timerWind, 'minutes') > 10) {
          logMsg("windThreshold(%d) < configWindHochSchwelle(%d)", windThreshold,
            configWindHochSchwelle);
          logMsg('moment().diff(timerWind) > 10min');
          flagWindalarm = false;
          logMsg('flagWindalarm = false');
          timerWind = undefined;

          status.update({mode: 'zurueck'}); // TODO was war vorher? => normal

          pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS); // Alarm abschalten.
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
      if(windThreshold >= configWindHochSchwelle) {
        logMsg("windThreshold(%d) >= configWindHochSchwelle(%d)", windThreshold,
          configWindHochSchwelle);
        flagWindalarm  = true;
        logMsg("flagWindalarm = true");
        status.update({mode: 'Windalarm'});

        // Wenn wirklich noch Sonne ist, gehen die Jalousien ja bald wieder runter.
        flagSun = false;
        timerSunDown = undefined;

        pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN); // Alarm. Dauersignal HOCH.
      } else { // windThreshold >= configWindHochSchwelle
        if(currentTime.hour()   === configNightHochStunden &&
           currentTime.minute() === configNightHochMinuten
        ) {
          // Night Hoch - morgens
          if(!flagNightAktiv) {
            flagNightAktiv = true;

            logMsg("configNightHoch(%02d:%02d)",
              configNightHochStunden, configNightHochMinuten);
            flagNight = false;
            logMsg("flagNight = false");

            // If there is a running thread, stop
            pthread_cancel(threads[0]);
            // Start new thread.
            action = JALOUSIE_GANZHOCH;
            pthread_create(&threads[0], NULL, &jalousieAction, &action);
          }
  // Original, konfigurierte zeit
  //        else if(currentTime.hour()   === configNightRunterStunden &&
  //                currentTime.minute() === configNightRunterMinuten)

  // Neu, Sonnenuntergang und Wetter
        } else if(currentTime.hour()   === calcRunterStunden &&
                  currentTime.minute() === calcRunterMinuten
        ) {
          // Night Runter - abends
          if(!flagNightAktiv) {
            flagNightAktiv = true;

  //            logMsg("configNightRunter(%02d:%02d)",
  //              configNightRunterStunden, configNightRunterMinuten);
            logMsg("calcRunter: %02d:%02d "
              "(wetterSonnenUntergang: %02d:%02d, wetterCode=%d %s",
              calcRunterStunden, calcRunterMinuten,
              wetterSonnenUntergangStunden, wetterSonnenUntergangMinuten,
              wetterCode, wetterLabel);
            flagNight = true;
            logMsg("flagNight = true");

            // If there is a running thread, stop
            pthread_cancel(threads[0]);
            // Start new thread.
            action = JALOUSIE_GANZRUNTER;
            pthread_create(&threads[0], NULL, &jalousieAction, &action);
          }
        } else { // Night
          flagNightAktiv = false;

          if(flagSun) {
            if(sunThreshold <= configSonneHochSchwelle) {
              if(!timerSunUp) {
                logMsg("sunThreshold(%d) <= configSonneHochSchwelle(%d)",
                  sunThreshold, configSonneHochSchwelle);
                logMsg("Start timerSunUp");
                timerSunUp = moment.utc();
              } else if(moment.utc().diff(timerSunUp, 'minutes') >=
                          configSonneHochVerzoegerung
              ) {
                logMsg("sunThreshold(%d) <= configSonneHochSchwelle(%d)",
                  sunThreshold, configSonneHochSchwelle);
                logMsg(`moment().diff(timerSunUp) >= ${configSonneHochVerzoegerung}min`);
                flagSun = false;
                logMsg("flagSun = false");
                timerSunUp = undefined;

                // If there is a running thread, stop
                pthread_cancel(threads[0]);
                // Start new thread.
                action = JALOUSIE_GANZHOCH;
                pthread_create(&threads[0], NULL, &jalousieAction, &action);
              }
            } // sunThreshold <= configSonneHochSchwelle
          } else { // flagSun
            if((sunThreshold >= configSonneRunterSchwelle) ||
               (sunThreshold >= (configSonneRunterSchwelle - 4) &&
                temperatureDHT >= configTemperaturRunterGrad)
            ) {
              if(!timerSunDown) {
                if(sunThreshold >= configSonneRunterSchwelle) {
                  logMsg("sunThreshold(%d) >= configSonneRunterSchwelle(%d)",
                    sunThreshold, configSonneRunterSchwelle);
                } else if(sunThreshold >= (configSonneRunterSchwelle - 4) &&
                        temperatureDHT >= configTemperaturRunterGrad
                ) {
                  logMsg("sunThreshold(%d) >= configSonneRunterSchwelle(%d) && "
                         "temperatureDHT(%.1f) >= configTemperaturRunterGrad(%d)",
                    sunThreshold, (configSonneRunterSchwelle - 4),
                    temperatureDHT, configTemperaturRunterGrad);
                } else {
                  logError("sunThreshold=%d, temperatureDHT=%.1f",
                    sunThreshold, temperatureDHT);
                }
                logMsg('Start timerSunDown');
                timerSunDown = moment.utc();
              } else if(moment.utc().diff(timerSunDown, 'minutes') >=
                          configSonneRunterVerzoegerung)
              ) {
                logMsg("sunThreshold(%d) >= configSonneRunterSchwelle(%d)",
                  sunThreshold, configSonneRunterSchwelle);
                logMsg(`(moment().diff(timerSunDown) >= ` +
                  `${configSonneRunterVerzoegerung}min`);
                flagSun = true;
                logMsg("flagSun = true");
                timerSunDown = undefined;

                // If there is a running thread, stop
                pthread_cancel(threads[0]);
                // Start new thread.
                action = JALOUSIE_SCHATTEN;
                pthread_create(&threads[0], NULL, &jalousieAction, &action);
              }
            } else { // sunThreshold >= configSonneRunterSchwelle
              // Timer zuruecksetzen
              if(timerSunDown) {
                logMsg("sunThreshold(%d) < configSonneRunterSchwelle(%d)",
                  sunThreshold, configSonneRunterSchwelle);
                timerSunDown = undefined;
              }
            } // sunThreshold >= configSonneRunterSchwelle
          } // flagSun
        } // Night
      } // windThreshold >= configWindHochSchwelle
    } // flagWindalarm

    status.update({
      flagNight:        flagNight,
      flagSun:          flagSun,
      flagWindalarm:    flagWindalarm,

      timerSunUp: moment.utc(moment.utc().diff(timerSunUp)).format('HH:mm:ss'),
      timerSunDown: moment.utc(moment.utc().diff(timerSunDown)).format('HH:mm:ss'),
      timerWind: moment.utc(moment.utc().diff(timerWind)).format('HH:mm:ss')
    });
  });
}, 1000);
