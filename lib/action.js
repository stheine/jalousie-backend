'use strict';

/* eslint-disable complexity */

// http://momentjs.com/docs/
const moment           = require('moment');
// http://caolan.github.io/async/docs.html
const async            = require('async');

// https://github.com/stheine/pigpiod
const pigpiod  = require('../../pigpiod'); // TODO

const {logDebug, logInfo, logError} = require('./troubleshooting');



// *************************************************************************
const JALOUSIE_AN    = 1;
const JALOUSIE_AUS   = 0;


// *************************************************************************
const STATE_RUNNING  = 0;
const STATE_FINISHED = 1;
const STATE_ABORT    = 1;



class Action {
  constructor(action, options) {
    this.action = action;
    this.config = options.config;
    this.gpio   = options.gpio;
    this.pi     = options.pi;
    this.start  = moment();

    logDebug(`Starting action thread ` +
      `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    this.state  = STATE_RUNNING;

    this.execute(action);
  }


  abort() {
    if(this.state === STATE_RUNNING) {
      logInfo(`Setting abort for current action thread ` +
        `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

      this.state = STATE_ABORT;
    }
  }


  log(message) {
    return done => {
      logInfo(message);
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
          logInfo(`Aborting current action thread ` +
            `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

          return done('abort');
        }

        return done(null);
      }, milliseconds);
    };
  }


  execute(action) {
    return new Promise((resolve, reject) => {
      let tasks;

      switch(action) {
        case 'JALOUSIE_STOP':
          // Der originale Aerotec merkt sich die letzte Bewegungsrichtung
          // und triggert den Stop in die Gegenrichtung.
          // Ist aber nicht noetig, auch mit immer HOCH stoppt er jedes mal.
          tasks = [
            this.log(
              'jalousieAction Stop: JALOUSIE_HOCH, AN, 140ms, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(140),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_GANZHOCH':
          tasks = [
            this.log(
              'jalousieAction GanzHoch: JALOUSIE_HOCH, AN, 3sek, AUS'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(3000),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_GANZRUNTER':
          tasks = [
            this.log(
              'jalousieAction GanzRunter: JALOUSIE_RUNTER, AN, 3sek, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(3000),
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
              this.log(
                'jalousieAction Schatten - 1 Runter: JALOUSIE_RUNTER, AN, ' +
                '3sek, AUS'),
              this.gpioWrite(this.gpio.down, JALOUSIE_AN),
              this.delay(3000),
              this.gpioWrite(this.gpio.down, JALOUSIE_AUS),
              this.delay(timeout * 1000),
              this.log(
                `jalousieAction Schatten - 2 Wendung: JALOUSIE_HOCH, AN, ` +
                `${this.config.sun.down.turnMilliseconds}ms, AUS`),
              this.gpioWrite(this.gpio.up, JALOUSIE_AN),
              this.delay(this.config.sun.down.turnMilliseconds),
              this.gpioWrite(this.gpio.up, JALOUSIE_AUS),
              this.log(
                'jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, ' +
                '140ms, AUS'),
              this.gpioWrite(this.gpio.down, JALOUSIE_AN),
              this.delay(140),
              this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
            ];
          }
          break;

        case 'JALOUSIE_WENDUNG':
          tasks = [
            this.log(
              'jalousieAction Wendung - 1 Runter: JALOUSIE_RUNTER, AN, ' +
              '3sek, AUS'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(3000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS),
            this.log(
              `jalousieAction Wendung - 2 Wendung: JALOUSIE_HOCH, AN, ` +
              `${this.config.sun.down.turnMilliseconds}ms, AUS`),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(this.config.sun.down.turnMilliseconds),
            this.gpioWrite(this.gpio.up, JALOUSIE_AUS),
            this.log(
              'jalousieAction Schatten - 3 Stop: JALOUSIE_RUNTER, AN, ' +
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
            this.log('jalousieAction Individuell'),
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
            this.log('jalousieAction Alle Runter'),
            this.gpioWrite(this.gpio.down, JALOUSIE_AN),
            this.delay(5000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_ALLE_HOCH':
          // Bringt ueber die Alarmfunktion alle Jalousien nach oben.
          tasks = [
            this.log('jalousieAction Alle Hoch'),
            this.gpioWrite(this.gpio.up, JALOUSIE_AN),
            this.delay(5000),
            this.gpioWrite(this.gpio.down, JALOUSIE_AUS)
          ];
          break;

        case 'JALOUSIE_SONDER_TEST':
          tasks = [
            this.log('jalousieAction Sondertest')
          ];
          break;

        default:
          logError(`Unhandled action=${action}`);
          break;
      }

      if(tasks) {
        async.waterfall(tasks, err => {
          this.state = STATE_FINISHED;

          logDebug(`Finished action thread ` +
            `(action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

          if(err) {
            return reject(err);
          }

          return resolve();
        });
      } else {
        return reject();
      }
    });
  }
}


module.exports = Action;
