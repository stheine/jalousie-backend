'use strict';

// http://momentjs.com/docs/
const moment           = require('moment');
// http://caolan.github.io/async/docs.html
const async            = require('async');

const {logDebug, logInfo, logError} = require('troubleshooting');



// *************************************************************************
const JALOUSIE_AN          = 1;
const JALOUSIE_AUS         = 0;


// *************************************************************************
const JALOUSIE_GANZHOCH    =  1;
const JALOUSIE_GANZRUNTER  =  2;
const JALOUSIE_SCHATTEN    =  3;
const JALOUSIE_WENDUNG     =  4;
const JALOUSIE_INDIVIDUELL = 10;
const JALOUSIE_ALLE_RUNTER = 11;
const JALOUSIE_ALLE_HOCH   = 12;
const JALOUSIE_SONDER_TEST = 20;

const JALOUSIE_ACTION_STATE_RUNNING  = 0;
const JALOUSIE_ACTION_STATE_FINISHED = 1;
const JALOUSIE_ACTION_STATE_ABORT    = 1;



const Action = function(action) {
  this.action = action;
  this.start  = moment();

  logDebug(`Starting action thread ` +
    `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

  this.state  = JALOUSIE_ACTION_STATE_RUNNING;

  jalousieAction(action);
};

Action.prototype.abort = function() {
  if(this.state === JALOUSIE_ACTION_STATE_RUNNING) {
    logInfo(`Setting abort for current action thread ` +
      `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    this.state = JALOUSIE_ACTION_STATE_ABORT;
  }
};

const jalousieActionLog = function(message) {
  return (done) => {
    logInfo(message);
    done(null);
  };
};

const jalousieActionGpioWrite = function(gpio, level) {
  return (done) => {
    pigpiod.gpio_write(pi, gpio, level);
    done(null);
  };
};

const jalousieActionDelay = function(milliseconds) {
  return (done) => {
    setTimeout(() => {
      if(this.state === JALOUSIE_ACTION_STATE_ABORT) {
        logInfo(`Aborting current action thread ` +
          `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);
        done('abort');
      } else {
        done(null);
      }
    }, milliseconds);
  };
};

const jalousieActionFinished = function() {
  return (err) => {
    this.state = JALOUSIE_ACTION_STATE_FINISHED;

    logDebug(`Finished action thread ` +
      `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    if(err) {
      return reject(err);
    }

    return resolve();
  };
};

const jalousieAction = function(action) {
  return new Promise((resolve, reject) => {
    let actions;

    switch(action) {
      case JALOUSIE_GANZHOCH:
        actions = [
          jalousieActionLog(
            'jalousieAction GanzHoch: JALOUSIE_HOCH, AN, 3sek, AUS'),
          jalousieActionGpioWrite(GPIO_JALOUSIE_HOCH, JALOUSIE_AN),
          jalousieActionDelay(3000),
          jalousieActionGpioWrite(GPIO_JALOUSIE_HOCH, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_GANZRUNTER:
        actions = [
          jalousieActionLog('jalousieAction GanzRunter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
          jalousieActionGpioWrite(GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(3000),
          jalousieActionGpioWrite(pi, GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_SCHATTEN:
        let timeout;

        // TODO ich glaube das stimmt nicht - nochmal mit original verleichen
        if(configSonneRunterPosition > 3) {
          timeout = configSonneRunterPosition - 3;
        } else {
          timeout = 0;
        }

        actions = [
          jalousieActionLog(
            'jalousieAction Schatten - 1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(3000),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS),
          jalousieActionDelay(timeout * 1000),
          jalousieActionLog(`jalousieAction Schatten - 2 Wendung: JALOUSIE_HOCH, AN, ` +
            `${configSonneRunterWendung}ms, AUS`),
          jalousieActionGpioWrite( GPIO_JALOUSIE_HOCH, JALOUSIE_AN),
          jalousieActionDelay(configSonneRunterWendung),
          jalousieActionGpioWrite( GPIO_JALOUSIE_HOCH, JALOUSIE_AUS),
          jalousieActionLog('jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, ' +
            '140ms, AUS'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(140),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_WENDUNG:
        actions = [
          jalousieActionLog(
            'jalousieAction Wendung - 1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(3000),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS),
          jalousieActionLog(`jalousieAction Wendung - 2 Wendung: JALOUSIE_HOCH, AN, ` +
            `${configSonneRunterWendung}ms, AUS`),
          jalousieActionGpioWrite( GPIO_JALOUSIE_HOCH, JALOUSIE_AN),
          jalousieActionDelay(configSonneRunterWendung),
          jalousieActionGpioWrite( GPIO_JALOUSIE_HOCH, JALOUSIE_AUS),
          jalousieActionLog('jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, ' +
            '140ms, AUS'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(140),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_INDIVIDUELL:
        // Bringt die auf Automatik eingestellten Jalousien auf ihre
        // individuellen Schattenpositionen, nicht auf die zentral konfigurierte,
        // indem das doppelte kurze Tippen simuliert wird.
        actions = [
          jalousieActionLog('jalousieAction Individuell'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(200),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS),
          jalousieActionDelay(200),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(200),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_ALLE_RUNTER:
        // Bringt ueber die Alarmfunktion alle Jalousien nach unten.
        // Allerdings in die komplett dunkle Lage.
        actions = [
          jalousieActionLog('jalousieAction Alle Runter'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AN),
          jalousieActionDelay(5000),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_ALLE_HOCH:
        // Bringt ueber die Alarmfunktion alle Jalousien nach oben.
        actions = [
          jalousieActionLog('jalousieAction Alle Hoch'),
          jalousieActionGpioWrite( GPIO_JALOUSIE_HOCH, JALOUSIE_AN),
          jalousieActionDelay(5000),
          jalousieActionGpioWrite( GPIO_JALOUSIE_RUNTER, JALOUSIE_AUS)
        ];
        break;

      case JALOUSIE_SONDER_TEST:
        actions = [
          jalousieActionLog('jalousieAction Sondertest')
        ];
        break;

      default:
        logError(`Unhandled jalousieAction=${actionPtr}`);
        break;
    }

    if(actions) {
      async.waterfall(actions, jalousieActionFinished());
    } else {
      reject();
    }
  });
};



module.exports = Action;
