'use strict';

const fs       = require('fs');

// https://www.npmjs.com/package/npid
const npid     = require('npid');
// https://www.npmjs.com/package/rrdtools
const rrdtools = require('rrdtools');
// http://momentjs.com/docs/
const moment   = require('moment');

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module
const {logDebug, logInfo, logError} = require('troubleshooting');


// TODO Alle messwerte ins rrdtool schreiben.
// TODO Automatik vs Handbetrieb. wirkt sich auf schaltzeiten und sonne aus.
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
let pi                     = -1;
let MCPSpiHandle           = -1;

// Tasten
let stateTasterRunter      = 1;
let stateTasterHoch        = 1;

// Flags
let flagSchaltzeit         = false;
let flagSonne              = false;
let flagWindalarm          = false;

// verhindert erneutes Ausfuehren in der naechsten Sekunde
let flagSchaltzeitAktiv    = false;

// windCounter. Increased by interrupt.
let windCounter            = 0;



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
// intrGpioWind() - Interrupt handler for wind sensor
let intrGpioWindLastTick = pigpiod.get_current_tick();
const intrGpioWind = function(pi, userGpio, level, tick) {
  let tickSinceLast;

  if(level != pigpiod.PI_TIMEOUT) {
    tickSinceLast        = tick - intrGpioWindLastTick;
    intrGpioWindLastTick = tick;
    if(tickSinceLast < 10000) {
      // Phantominterrupt (> 100Hz)
      return;
    }
//    else if(tickSinceLast < 100000) {
//      logMsg("Interrupt Windsensor tick=%zu", tickSinceLast);
//    }
  }

  windCounter++;
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

    case SIGINT:
    case SIGTERM:
      logMsg("Quit process\n\n\n");

      writeStatus("prozess", FMT_STRING, "stopped");

      spi_close(pi, MCPSpiHandle);
      pigpio_stop(pi);
      exit(0);
      break;

    case SIGCONT:
      // Ignore
      break;

    default:
      logError("Signal %d, Sending PID: %ld, UID: %ld", signal,
        (long)siginfo->si_pid, (long)siginfo->si_uid);
      break;
  }
}
*/




// *********************************************************************************
// main()
FILE *aussenTemperaturHandle;
char aussenTemperaturBuffer[100];
float temperaturAussen  = -999;
int sonnenschwelle;
int windschwelle;
float temperaturKTY     = -999;;
float temperaturDHT     = -999;
float luftfeuchtigkeit  = -999;
double timerWind        = 0;
double timerSonneRunter = 0;
double timerSonneHoch   = 0;
struct sigaction signalAction;
time_t currentTimestamp;
struct tm *currentTime;
int action;
threads[0] = 0;
uint32_t loopStartTick;
dht11Result *dht11Data;
int wetterAktualisiertStunde = -1;
char rrdData[100];
char *rrdParams[4];
int calcRunterStunden = -1;
int calcRunterMinuten = -1;
char *wetterLabel = NULL;

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

// Read the initial weather data
readWeather();

// Initialize process flags and write into the status.xml file
writeStatus("prozess", FMT_STRING, "running");
writeStatus("modus",   FMT_STRING, "normal");

// sets up the pigpio library
if((pi = pigpio_start(NULL, NULL)) < 0) {
  logError("Failed to pigpio_start()");
  return(1);
}

// sets up the pigpio SIP interface
// TODO was ist ein guter wert fuer Baud?
//      1000000 scheint zu tun, mit gelegentlichen falschen werten.
if((MCPSpiHandle = spi_open(pi, MCP3204_SPI_CHANNEL, 500000, 0)) < 0) {
  logError("Failed to spi_open(): %d", MCPSpiHandle);
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
// and attach intrGpioWind() to the interrupt
if(pigpiod.callback(pi, GPIO_WIND, FALLING_EDGE, &intrGpioWind) < 0) {
  logError("Failed to callback(pi, GPIO_WIND)");
  return(1);
}

// Initialize the signal handler for important signals
memset(&signalAction, '\0', sizeof(signalAction));
signalAction.sa_sigaction = &signalHandler;
signalAction.sa_flags = SA_SIGINFO;

if(sigaction(SIGUSR1, &signalAction, NULL) < 0) {
  logError("Failed to sigaction(SIGUSR1)");
  return(1);
}

if(sigaction(SIGCONT, &signalAction, NULL) < 0) {
  logError("Failed to sigaction(SIGCONT)");
  return(1);
}

if(sigaction(SIGINT, &signalAction, NULL) < 0) {
  logError("Failed to sigaction(SIGINT)");
  return(1);
}

if(sigaction(SIGTERM, &signalAction, NULL) < 0) {
  logError("Failed to sigaction(SIGTERM)");
  return(1);
}

// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
setInterval(() => {
  loopStartTick = pigpiod.get_current_tick(pi);

  // Zeit holen für spätere Bedingungen auf der Uhrzeit.
  currentTimestamp = moment();
  currentTime = localtime(&currentTimestamp);

  // Zeit ins XML file schreiben
  writeStatus("zeit", FMT_NOW, NULL);

  // read wind data, as collected by interrupt handler
  windschwelle = getWindschwelle(pi);

  // read light sensor ADC value through SPI
  sonnenschwelle = getSonnenschwelle(pi, MCPSpiHandle);

  // read room temperature
  temperaturKTY = KTY81Temp(pi, MCPSpiHandle);

  // read room temperature and humidity, once per minute (at seconds === 0)
  if(currentTime->tm_sec === 0 || temperaturDHT === -999) {
    dht11Data = dht11();
    if(dht11Data->status === DHT_GOOD) {
      temperaturDHT    = dht11Data->temperatur;
      luftfeuchtigkeit = dht11Data->luftfeuchtigkeit;

      writeStatus("temperaturDHT",    FMT_FLOAT_2_1, &dht11Data->temperatur);
      writeStatus("luftfeuchtigkeit", FMT_FLOAT_2_1, &dht11Data->luftfeuchtigkeit);
      writeStatus("DHT11Status",      FMT_INT,       &dht11Data->status);
      writeStatus("DHT11Timestamp",   FMT_FLOAT,     &dht11Data->timestamp); // moment() to format
    } else {
      logMsg("Failed to get data from DHT11. status=%d", dht11Data->status);
    }
    free(dht11Data);
  }

  // lese Aussentemperatur vom Vito
  aussenTemperaturHandle = fopen("/var/vito/_tempAussen.dat", "r");
  if(aussenTemperaturHandle === NULL) {
    logError("Failed to open /var/vito/_tempAussen.dat");
    // don't stop here
  } else {
    fgets(aussenTemperaturBuffer, sizeof(aussenTemperaturBuffer),
      aussenTemperaturHandle);
    fclose(aussenTemperaturHandle);
    aussenTemperaturBuffer[sizeof(  aussenTemperaturBuffer) - 1] = 0;
    sscanf(aussenTemperaturBuffer, "%f", &temperaturAussen);
    writeStatus("temperaturAussen", FMT_FLOAT_4_1, &temperaturAussen);
  }

  // Lese Wetter Daten, nur einmal pro Stunde.
  // Die Daten werden zur vollen Stunde geholt,
  // also lese ich sie hier 2 Minuten später,
  // wenn sie sicher aktualisiert sind.
  if((calcRunterStunden === -1) ||
     (calcRunterMinuten === -1) ||
     (currentTime->tm_min === 2 &&
      currentTime->tm_hour != wetterAktualisiertStunde)
  ) {
    wetterRunterZeit(&calcRunterStunden, &calcRunterMinuten, &wetterLabel);
    wetterAktualisiertStunde = currentTime->tm_hour;
  }

  // Zusaetzlicher Check ueber 'haengende' Tasten.
  if(stateTasterRunter === 0 &&
     pigpiod.gpio_read(pi, GPIO_TASTER_RUNTER) === 1
  ) {
    logMsg("Haengenden Taster JALOUSIE_RUNTER gefixt");
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS);
    stateTasterRunter = 1;
  }
  if(stateTasterHoch === 0 &&
     pigpiod.gpio_read(pi, GPIO_TASTER_HOCH) === 1
  ) {
    logMsg("Haengenden Taster JALOUSIE_HOCH gefixt");
    pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS);
    stateTasterHoch = 1;
  }
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


  // Messwerte in rrd speichern fuer die graphische Ausgabe
  sprintf(rrdData,
    "N:%d:%d:%4.1f:%2.1f:%2.1f:%4.1f:%d",
    windschwelle,
    sonnenschwelle,
    temperaturKTY,
    temperaturDHT,
    luftfeuchtigkeit,
    temperaturAussen,
    wetterCode);
  rrdParams[0] = "rrdupdate";
  rrdParams[1] = "/var/jalousie/jalousie.rrd";
  rrdParams[2] = rrdData;
  rrdParams[3] = NULL;
  rrd_clear_error();
  rrd_update(3, rrdParams);
  if(rrd_test_error() != 0) {
    logError("rrd_update(%s) failed with %s\n", rrdData, rrd_get_error());
    // don't stop here
  }

  sprintf(rrdData,
    "N:%d:%d",
    flagSonne,
    flagWindalarm);
  rrdParams[0] = "rrdupdate";
  rrdParams[1] = "/var/jalousie/flags.rrd";
  rrdParams[2] = rrdData;
  rrdParams[3] = NULL;
  rrd_clear_error();
  rrd_update(3, rrdParams);
  if(rrd_test_error() != 0) {
    logError("rrd_update(%s) failed with %s\n", rrdData, rrd_get_error());
    // don't stop here
  }



  // so, jetzt habe ich die werte und kann darauf reagieren.
  if(flagWindalarm) {
    // TODO im original gibt es noch die Bedingung
    // 'der sensor ist weg->alarm->jetzt ist er wieder da->alarm ende'
    // ohne Verzoegerung.
    if(windschwelle < configWindHochSchwelle) {
      if(!timerWind) {
        logMsg("windschwelle(%d) < configWindHochSchwelle(%d)", windschwelle,
          configWindHochSchwelle);
        logMsg("Start timerWind");
        timerWind = time_time();
      } else if((time_time() - timerWind) > (double) (10 * 60)) {
        logMsg("windschwelle(%d) < configWindHochSchwelle(%d)", windschwelle,
          configWindHochSchwelle);
        logMsg("(time_time() - timerWind) > 10min");
        flagWindalarm = false;
        logMsg("flagWindalarm = false");
        timerWind = 0;

        writeStatus("modus", FMT_STRING, "zurueck"); // TODO was war vorher?

        pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AUS); // Alarm abschalten.
        if(flagSchaltzeit) {
          // TODO will ich das wirklich? nacht die jalousien unnoetig bewegen?
          //      vielleicht besser noch zeitlich einschraenken...

          // TODO
          // Jalousien wieder auf den vorigen Stand bringen
          //   - impuls runter
          //   - warten bis sicher unten
        } // flagSchaltzeit
      }
    }
  } else { // flagWindalarm
    if(windschwelle >= configWindHochSchwelle) {
      logMsg("windschwelle(%d) >= configWindHochSchwelle(%d)", windschwelle,
        configWindHochSchwelle);
      flagWindalarm  = true;
      logMsg("flagWindalarm = true");
      writeStatus("modus", FMT_STRING, "Windalarm");

      // Wenn wirklich noch Sonne ist, gehen die Jalousien ja bald wieder runter.
      flagSonne = false;
      timerSonneRunter = 0;

      pigpiod.gpio_write(pi, GPIO_JALOUSIE_HOCH, JALOUSIE_AN); // Alarm. Dauersignal HOCH.
    } else { // windschwelle >= configWindHochSchwelle
      if(currentTime->tm_hour === configSchaltzeitHochStunden &&
         currentTime->tm_min  === configSchaltzeitHochMinuten
      ) {
        // Schaltzeit Hoch - morgens
        if(!flagSchaltzeitAktiv) {
          flagSchaltzeitAktiv = true;

          logMsg("configSchaltzeitHoch(%02d:%02d)",
            configSchaltzeitHochStunden, configSchaltzeitHochMinuten);
          flagSchaltzeit = false;
          logMsg("flagSchaltzeit = false");

          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_GANZHOCH;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);
        }
// Original, konfigurierte zeit
//        else if(currentTime->tm_hour === configSchaltzeitRunterStunden &&
//                currentTime->tm_min  === configSchaltzeitRunterMinuten)

// Neu, Sonnenuntergang und Wetter
      } else if(currentTime->tm_hour === calcRunterStunden &&
                currentTime->tm_min  === calcRunterMinuten
      ) {
        // Schaltzeit Runter - abends
        if(!flagSchaltzeitAktiv) {
          flagSchaltzeitAktiv = true;

//            logMsg("configSchaltzeitRunter(%02d:%02d)",
//              configSchaltzeitRunterStunden, configSchaltzeitRunterMinuten);
          logMsg("calcRunter: %02d:%02d "
            "(wetterSonnenUntergang: %02d:%02d, wetterCode=%d %s",
            calcRunterStunden, calcRunterMinuten,
            wetterSonnenUntergangStunden, wetterSonnenUntergangMinuten,
            wetterCode, wetterLabel);
          flagSchaltzeit = true;
          logMsg("flagSchaltzeit = true");

          // If there is a running thread, stop
          pthread_cancel(threads[0]);
          // Start new thread.
          action = JALOUSIE_GANZRUNTER;
          pthread_create(&threads[0], NULL, &jalousieAction, &action);
        }
      } else { // Schaltzeit
        flagSchaltzeitAktiv = false;

        if(flagSonne) {
          if(sonnenschwelle <= configSonneHochSchwelle) {
            if(!timerSonneHoch) {
              logMsg("sonnenschwelle(%d) <= configSonneHochSchwelle(%d)",
                sonnenschwelle, configSonneHochSchwelle);
              logMsg("Start timerSonneHoch");
              timerSonneHoch = time_time();
            } else if((time_time() - timerSonneHoch) >=
                        (double) (configSonneHochVerzoegerung * 60)
            ) {
              logMsg("sonnenschwelle(%d) <= configSonneHochSchwelle(%d)",
                sonnenschwelle, configSonneHochSchwelle);
              logMsg("(time_time() - timerSonneHoch) >= %dmin",
                configSonneHochVerzoegerung);
              logMsg("(%f - %f)", time_time(), timerSonneHoch); // TODO
              flagSonne = false;
              logMsg("flagSonne = false");
              timerSonneHoch = 0;

              // If there is a running thread, stop
              pthread_cancel(threads[0]);
              // Start new thread.
              action = JALOUSIE_GANZHOCH;
              pthread_create(&threads[0], NULL, &jalousieAction, &action);
            }
          } // sonnenschwelle <= configSonneHochSchwelle
        } else { // flagSonne
          if((sonnenschwelle >= configSonneRunterSchwelle) ||
             (sonnenschwelle >= (configSonneRunterSchwelle - 4) &&
              temperaturDHT >= configTemperaturRunterGrad)
          ) {
            if(!timerSonneRunter) {
              if(sonnenschwelle >= configSonneRunterSchwelle) {
                logMsg("sonnenschwelle(%d) >= configSonneRunterSchwelle(%d)",
                  sonnenschwelle, configSonneRunterSchwelle);
              } else if(sonnenschwelle >= (configSonneRunterSchwelle - 4) &&
                      temperaturDHT >= configTemperaturRunterGrad
              ) {
                logMsg("sonnenschwelle(%d) >= configSonneRunterSchwelle(%d) && "
                       "temperaturDHT(%.1f) >= configTemperaturRunterGrad(%d)",
                  sonnenschwelle, (configSonneRunterSchwelle - 4),
                  temperaturDHT, configTemperaturRunterGrad);
              } else {
                logError("sonnenschwelle=%d, temperaturDHT=%.1f",
                  sonnenschwelle, temperaturDHT);
              }
              logMsg("Start timerSonneRunter");
              timerSonneRunter = time_time();
            } else if((time_time() - timerSonneRunter) >=
                        (double) (configSonneRunterVerzoegerung * 60)
            ) {
              logMsg("sonnenschwelle(%d) >= configSonneRunterSchwelle(%d)",
                sonnenschwelle, configSonneRunterSchwelle);
              logMsg("(time_time() - timerSonneRunter) >= %dmin",
                configSonneRunterVerzoegerung);
              flagSonne = true;
              logMsg("flagSonne = true");
              timerSonneRunter = 0;

              // If there is a running thread, stop
              pthread_cancel(threads[0]);
              // Start new thread.
              action = JALOUSIE_SCHATTEN;
              pthread_create(&threads[0], NULL, &jalousieAction, &action);
            }
          } else { // sonnenschwelle >= configSonneRunterSchwelle
            // Timer zuruecksetzen
            if(timerSonneRunter) {
              logMsg("sonnenschwelle(%d) < configSonneRunterSchwelle(%d)",
                sonnenschwelle, configSonneRunterSchwelle);
              timerSonneRunter = 0;
            }
          } // sonnenschwelle >= configSonneRunterSchwelle
        } // flagSonne
      } // Schaltzeit
    } // windschwelle >= configWindHochSchwelle
  } // flagWindalarm

  writeStatus("flagSchaltzeit",   FMT_FLAG, &flagSchaltzeit);
  writeStatus("flagSonne",        FMT_FLAG, &flagSonne);
  writeStatus("flagWindalarm",    FMT_FLAG, &flagWindalarm);

  writeStatus("timerSonneHoch",   FMT_TIMER, &timerSonneHoch);
  writeStatus("timerSonneRunter", FMT_TIMER, &timerSonneRunter);
  writeStatus("timerWind",        FMT_TIMER, &timerWind);

//    trace("");

  // wait to let the next cycle start 1 second after
  // the beginning of the current cycle.
  time_sleep(max(0.5, 1 - max(0, ((get_current_tick(pi) - loopStartTick) / 1000000))));
}, 1000);

writeStatus("prozess", FMT_STRING, "stopped");
