'use strict';

/* eslint-disable complexity */

// http://momentjs.com/docs/
const moment           = require('moment');
// http://caolan.github.io/async/docs.html
const async            = require('async');

// https://www.npmjs.com/package/@stheine/pigpiod
// TODO const pigpiod  = require('@stheine/pigpiod');
// Faking the gpio actions
const pigpiod  = {
  /* eslint-disable camelcase */
  gpio_write: (pi, gpio, level) => {
    /* eslint-disable no-console */
    console.log(`               gpio_write(${gpio}, ${level})`);
    /* eslint-enable no-console */
  }
  /* eslint-disable camelcase */
};



// *************************************************************************
const GPIO_JALOUSIE_RUNTER =  4; // GPIO4,  Pin7  - Output - Jalousie runter
const GPIO_JALOUSIE_HOCH   = 17; // GPIO17, Pin11 - Output - Jalousie hoch

const JALOUSIE_AN    = 1;
const JALOUSIE_AUS   = 0;


// *************************************************************************
const STATE_RUNNING  = 0;
const STATE_FINISHED = 1;
const STATE_ABORT    = 1;



let actionId = 0;
let actionThread;

class Action {
  constructor(globals) {
    this.config = globals.config;
    this.pi     = globals.pi;
    this.log    = globals.log;

    this.gpio = {
      down: GPIO_JALOUSIE_RUNTER,
      up:   GPIO_JALOUSIE_HOCH
    };
  }


  abort() {
    if(this.state === STATE_RUNNING) {
      // Stopping any output that might be active currently
      this.gpioWrite(this.gpio.up,   JALOUSIE_AUS);
      this.gpioWrite(this.gpio.down, JALOUSIE_AUS);

      this.log.debug(`actionId=${this.actionId} Flagging abort (` +
        `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

      this.state = STATE_ABORT;
    }
  }


  logTask(message) {
    return done => {
      this.log.info(message);
      done(null);
    };
  }


  gpioWrite(gpio, level) {
    return done => {
      pigpiod.gpio_write(this.pi, gpio, level);
      done(null);
    };
  }


  delay(milliseconds) {
    return done => {
      setTimeout(() => {
        if(this.state === STATE_ABORT) {
          this.log.debug(`actionId=${this.actionId} Cancelling (` +
            `action=${this.action}, ` +
            `start=${this.start.format('HH:mm:ss')})`);

          return done('abort');
        }

        return done(null);
      }, milliseconds);
    };
  }


  execute(action) {
    this.action   = action;
    this.actionId = actionId;
    actionId++;
    this.start  = moment();
    this.state  = STATE_RUNNING;

    this.log.debug(`actionId=${this.actionId} Starting (` +
      `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    return new Promise((resolve, reject) => {
      let tasks;

      this.log.debug(`Action.execute(${action})`);

      switch(action) {
        case 'JALOUSIE_AUS':
          tasks = [
            this.logTask('Aus: ' +
              'JALOUSIE_HOCH, AUS, JALOUSIE_RUNTER, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_STOP':
          // Der originale Aerotec merkt sich die letzte Bewegungsrichtung
          // und triggert den Stop in die Gegenrichtung.
          // Ist aber nicht noetig, auch mit immer HOCH stoppt er jedes mal.
          tasks = [
            this.logTask('Stop: JALOUSIE_HOCH, AN, 140ms, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(140),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_GANZHOCH':
          tasks = [
            this.logTask('GanzHoch: JALOUSIE_HOCH, AN, 3sek, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(3000),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_GANZRUNTER':
          tasks = [
            this.logTask('GanzRunter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(3000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_HOCH_AN':
          tasks = [
            this.logTask('HochAn, JALOUSIE_HOCH, AN'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN)
          ];
          break;

        case 'JALOUSIE_HOCH_AUS':
          tasks = [
            this.logTask('HochAus, JALOUSIE_HOCH, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_RUNTER_AN':
          tasks = [
            this.logTask('RunterAn, JALOUSIE_RUNTER, AN'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN)
          ];
          break;

        case 'JALOUSIE_RUNTER_AUS':
          tasks = [
            this.logTask('RunterAus, JALOUSIE_RUNTER, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_SCHATTEN':
          {
            let timeout;

            // TODO ich glaube das stimmt nicht - mit original vergleichen!
            if(this.config.sun.down.moveSeconds > 3) {
              timeout = this.config.sun.down.moveSeconds - 3;
            } else {
              timeout = 0;
            }

            tasks = [
              this.logTask('Shadow-1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
              this.gpioWrite(this.gpio.down, JALOUSIE_AN),
              this.delay(3000),
              this.gpioWrite(this.gpio.down, JALOUSIE_AUS),
              this.delay(timeout * 1000),
              this.logTask(`Shadow-2 Wendung: JALOUSIE_HOCH, AN, ` +
                `${this.config.sun.down.turnMilliseconds}ms, AUS`),
              this.gpioWrite(this.gpio.up, JALOUSIE_AN),
              this.delay(this.config.sun.down.turnMilliseconds),
              this.gpioWrite(this.gpio.up, JALOUSIE_AUS),
              this.logTask('Shadow-3 Stop: JALOUSIE_RUNTER, AN, 140ms, AUS'),
              this.gpioWrite(this.gpio.down, JALOUSIE_AN),
              this.delay(140),
              this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
            ];
          }
          break;

        case 'JALOUSIE_WENDUNG':
          tasks = [
            this.logTask('Turn-1 Runter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(3000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS),
            this.logTask(`Turn-2 Wendung: JALOUSIE_HOCH, AN, ` +
              `${this.config.sun.down.turnMilliseconds}ms, AUS`),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(this.config.sun.down.turnMilliseconds),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS),
            this.logTask('Turn-3 Stop: JALOUSIE_RUNTER, AN, ' +
              '140ms, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(140),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_INDIVIDUELL':
          // Bringt die auf Automatik eingestellten Jalousien auf ihre
          // individuellen Schattenpositionen, nicht auf die zentral
          // konfigurierte, // indem das doppelte kurze Tippen simuliert wird.
          tasks = [
            this.logTask('Individuell'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(200),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS),
            this.delay(200),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(200),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_ALLE_RUNTER':
          // Bringt ueber die Alarmfunktion alle Jalousien nach unten.
          // Allerdings in die komplett dunkle Lage.
          tasks = [
            this.logTask('Alle Runter'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(5000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_ALLE_HOCH':
          // Bringt ueber die Alarmfunktion alle Jalousien nach oben.
          tasks = [
            this.logTask('Alle Hoch'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(5000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_SONDER_TEST':
          tasks = [
            this.logTask('Sondertest')
          ];
          break;

        default:
          this.log.error(`Unhandled action=${action}`);
          break;
      }

      if(tasks) {
        async.waterfall(tasks, err => {
          this.state = STATE_FINISHED;

          if(err) {
            this.log.debug(`actionId=${this.actionId} Aborting (` +
              `action=${this.action}, ` +
              `start=${this.start.format('HH:mm:ss')})`);

            return reject(err);
          }

          this.log.debug(`actionId=${this.actionId} Finished (` +
            `action=${this.action}, ` +
            `start=${this.start.format('HH:mm:ss')})`);

          return resolve();
        });
      } else {
        return reject();
      }
    });
  }
}


const start = function(action, globals) {
  if(!globals) {
    throw new Error('action.start() missing globals');
  }

  if(actionThread) {
    actionThread.abort();
    actionThread = undefined;
  }

  actionThread = new Action(globals);
  actionThread.execute(action);
};


module.exports = {
  start
};
