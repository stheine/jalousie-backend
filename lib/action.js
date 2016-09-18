'use strict';

/* eslint-disable complexity */

// http://momentjs.com/docs/
const moment           = require('moment');
// http://caolan.github.io/async/docs.html
const async            = require('async');

// https://www.npmjs.com/package/@stheine/pigpiod
const realPigpiod  = require('@stheine/pigpiod');
// Faking the gpio actions
const fakePigpiod  = {
  /* eslint-disable camelcase */
  /* eslint-disable no-console */
  gpio_write: (pi, gpio, level) => {
    console.log(`                    gpio_write(${gpio}, ${level})`);
  },
  set_mode: (pi, gpio, mode) => {
    console.log(`                    set_mode(${gpio}, ${mode})`);
  }
  /* eslint-enable no-console */
  /* eslint-disable camelcase */
};

// const pigpiod = fakePigpiod; // TODO
const pigpiod = realPigpiod; // TODO



// *************************************************************************
const GPIO_JALOUSIE_DOWN =  4; // GPIO4,  Pin7  - Output - Jalousie down
const GPIO_JALOUSIE_UP   = 17; // GPIO17, Pin11 - Output - Jalousie up

const JALOUSIE_ON    = 1;
const JALOUSIE_OFF   = 0;


// *************************************************************************
const STATE_RUNNING  = 0;
const STATE_FINISHED = 1;
const STATE_ABORT    = 1;



let log;
let actionId = 0;
let actionThread;

class Action {
  constructor(globals) {
    this.config = globals.config;
    this.pi     = globals.pi;
  }


  abort() {
    if(this.state === STATE_RUNNING) {
      // Stopping any output that might be active currently
      this.gpioWrite(GPIO_JALOUSIE_UP,   JALOUSIE_OFF);
      this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF);

      log.debug(`actionId=${this.actionId} Flagging abort (` +
        `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

      this.state = STATE_ABORT;
    }
  }


  logTask(message) {
    return done => {
      log.info(message);
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
          log.debug(`actionId=${this.actionId} Cancelling (` +
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
    this.start    = moment();
    this.state    = STATE_RUNNING;

    log.debug(`actionId=${this.actionId} Starting (` +
      `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    return new Promise((resolve, reject) => {
      let tasks;

      log.debug(`Action.execute(${action})`);

      switch(action) {
        case 'JALOUSIE_OFF':
          tasks = [
            this.logTask('Off: ' +
              'JALOUSIE_UP, OFF, JALOUSIE_DOWN, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_STOP':
          // It's ok to signal stop in either direction.
          tasks = [
            this.logTask('Stop: JALOUSIE_UP, ON, 140ms, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON),
            this.delay(140),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_FULL_UP':
          tasks = [
            this.logTask('Full up: JALOUSIE_UP, ON, 3sec, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON),
            this.delay(3000),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_FULL_DOWN':
          tasks = [
            this.logTask('Full down: JALOUSIE_DOWN, ON, 3sec, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
            this.delay(3000),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_UP_ON':
          tasks = [
            this.logTask('Up on, JALOUSIE_UP, ON'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON)
          ];
          break;

        case 'JALOUSIE_UP_OFF':
          tasks = [
            this.logTask('Up off, JALOUSIE_UP, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_DOWN_ON':
          tasks = [
            this.logTask('Down on, JALOUSIE_DOWN, ON'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON)
          ];
          break;

        case 'JALOUSIE_DOWN_OFF':
          tasks = [
            this.logTask('Down off, JALOUSIE_DOWN, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_SHADOW':
          {
            tasks = [
              this.logTask('Shadow-1, down: JALOUSIE_DOWN, ON, 3sec, OFF'),
              this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
              this.delay(3000),
              this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
              this.delay(this.config.sun.down.moveSeconds * 1000),
              this.logTask(`Shadow-2, turn: JALOUSIE_UP, ON, ` +
                `${this.config.sun.down.turnMilliseconds}ms, OFF`),
              this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON),
              this.delay(this.config.sun.down.turnMilliseconds),
              this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
              this.logTask('Shadow-3, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
              this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
              this.delay(140),
              this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
            ];
          }
          break;

        case 'JALOUSIE_TURN':
          tasks = [
            this.logTask(`Turn-1, turn: JALOUSIE_UP, ON, ` +
              `${this.config.sun.down.turnMilliseconds}ms, OFF`),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON),
            this.delay(this.config.sun.down.turnMilliseconds),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
            this.logTask('Turn-2, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
            this.delay(140),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_INDIVIDUAL':
          // Moves the jalousies, set to automatic mode, to their
          // individual shadow state, by immitating the double-click.
          tasks = [
            this.logTask('Individual'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
            this.delay(200),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
            this.delay(200),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
            this.delay(200),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_ALL_DOWN':
          // Moves all jalousies down, by using the alarm function.
          // But this makes them move into the closed position.
          // There is no way to move the manual mode jalousies into
          // the shadown position.
          tasks = [
            this.logTask('All down'),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
            this.delay(5000),
            this.gpioWrite(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_ALL_UP':
          // Moves all jalousies up, by using the alarm function.
          tasks = [
            this.logTask('All up'),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_ON),
            this.delay(5000),
            this.gpioWrite(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
          ];
          break;

        case 'JALOUSIE_SPECIAL_TEST':
          tasks = [
            this.logTask('Special test')
          ];
          break;

        default:
          log.error(`Unhandled action=${action}`);
          break;
      }

      if(tasks) {
        async.waterfall(tasks, err => {
          this.state = STATE_FINISHED;

          if(err) {
            log.debug(`actionId=${this.actionId} Aborting (` +
              `action=${this.action}, ` +
              `start=${this.start.format('HH:mm:ss')})`);

            return reject(err);
          }

          log.debug(`actionId=${this.actionId} Finished (` +
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


const start = function(globals, action) {
  if(!globals) {
    throw new Error('action.start() missing globals');
  }

  if(actionThread) {
    actionThread.abort();
    actionThread = undefined;
  }

  actionThread = new Action(globals);
  actionThread.execute(action)
  .catch(err => {
    globals.log.info('Action aborted', err);
  });
};


const init = function(globals) {
  log = globals.log;

  // output, init 0 -> Transistor open -> Jalousie pull-up remains on 5V.
  pigpiod.set_mode(globals.pi, GPIO_JALOUSIE_UP,   pigpiod.PI_OUTPUT);
  pigpiod.set_mode(globals.pi, GPIO_JALOUSIE_DOWN, pigpiod.PI_OUTPUT);

  globals.log.info('Init: JALOUSIE_OFF');
  start(globals, 'JALOUSIE_OFF');
};


module.exports = {
  init,
  start
};
