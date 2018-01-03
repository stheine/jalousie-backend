'use strict';

/* eslint-disable comma-dangle */
/* eslint-disable complexity */
/* eslint-disable indent */

const delay  = require('delay');
const moment = require('moment');

const myPigpiod = {
  /* eslint-disable global-require */
  realPigpiod: require('@stheine/pigpiod'),
  /* eslint-enable global-require */
  // Faking the gpio actions
  fakePigpiod: {
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
  }
};

// const pigpiod = myPigpiod.fakePigpiod; // TODO
const pigpiod = myPigpiod.realPigpiod; // TODO



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
      this.gpioWriteFct(GPIO_JALOUSIE_UP,   JALOUSIE_OFF)();
      this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)();

      log.debug(`actionId=${this.actionId} Flagging abort (` +
        `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

      this.state = STATE_ABORT;
    }
  }


  /* eslint-disable class-methods-use-this */
  logTaskFct(message) {
    return () => {
      log.info(message);
    };
  }
  /* eslint-enable class-methods-use-this */


  gpioWriteFct(gpio, level) {
    return () => {
      pigpiod.gpio_write(this.pi, gpio, level);
    };
  }


  delayFct(milliseconds) {
    return async() => {
      await delay(milliseconds);

      if(this.state === STATE_ABORT) {
        log.debug(`actionId=${this.actionId} Cancelling (` +
          `action=${this.action}, ` +
          `start=${this.start.format('HH:mm:ss')})`);

        throw new Error('abort');
      }
    };
  }


  async execute(action) {
    this.action   = action;
    this.actionId = actionId;
    actionId++;
    this.start    = moment();
    this.state    = STATE_RUNNING;

//    log.debug(`actionId=${this.actionId} Starting (` +
//      `action=${this.action}, start=${this.start.format('HH:mm:ss')})`);

    let tasks;

//      log.debug(`Action.execute(${action})`);

    switch(action) {
      case 'JALOUSIE_OFF':
        tasks = [
          this.logTaskFct('Off: ' +
            'JALOUSIE_UP, OFF, JALOUSIE_DOWN, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_STOP':
        // It's ok to signal stop in either direction.
        tasks = [
          this.logTaskFct('Stop: JALOUSIE_UP, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_FULL_UP':
        tasks = [
          this.logTaskFct('Full up: JALOUSIE_UP, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_FULL_DOWN':
        tasks = [
          this.logTaskFct('Full down: JALOUSIE_DOWN, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_UP_ON':
        tasks = [
          this.logTaskFct('Up on, JALOUSIE_UP, ON'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON)
        ];
        break;

      case 'JALOUSIE_UP_OFF':
        tasks = [
          this.logTaskFct('Up off, JALOUSIE_UP, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_DOWN_ON':
        tasks = [
          this.logTaskFct('Down on, JALOUSIE_DOWN, ON'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON)
        ];
        break;

      case 'JALOUSIE_DOWN_OFF':
        tasks = [
          this.logTaskFct('Down off, JALOUSIE_DOWN, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_SHADOW':
        tasks = [
          this.logTaskFct('Shadow-1, down: JALOUSIE_DOWN, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
          this.delayFct(this.config.sun.down.moveSeconds * 1000),
          this.logTaskFct(`Shadow-2, turn: JALOUSIE_UP, ON, ` +
            `${this.config.sun.down.turnMilliseconds}ms, OFF`),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(this.config.sun.down.turnMilliseconds),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.logTaskFct('Shadow-3, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_TURN':
        tasks = [
          this.logTaskFct(`Turn-1, turn: JALOUSIE_UP, ON, ` +
            `${this.config.sun.down.turnMilliseconds}ms, OFF`),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(this.config.sun.down.turnMilliseconds),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.logTaskFct('Turn-2, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_INDIVIDUAL':
        // Moves the jalousies, set to automatic mode, to their
        // individual shadow state, by immitating the double-click.
        tasks = [
          this.logTaskFct('Individual'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_ALL_DOWN':
        // Moves all jalousies down, by using the alarm function.
        // But this makes them move into the closed position.
        // There is no way to move the manual mode jalousies into
        // the shadown position.
        tasks = [
          this.logTaskFct('All down'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(5000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_ALL_UP':
        // Moves all jalousies up, by using the alarm function.
        tasks = [
          this.logTaskFct('All up'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(5000),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF)
        ];
        break;

      case 'JALOUSIE_SPECIAL_TEST':
        tasks = [
          this.logTaskFct('Special test')
        ];
        break;

      default:
        log.error(`Unhandled action=${action}`);
        break;
    }

    if(tasks) {
      // Stop all outputs to start with a defined state,
      // even if an action was cancelled in between.
      try {
        for(const task of [
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ].concat(tasks)) {
          await task();
        }

        this.state = STATE_FINISHED;

//          log.debug(`actionId=${this.actionId} Finished (` +
//            `action=${this.action}, ` +
//            `start=${this.start.format('HH:mm:ss')})`);
      } catch(err) {
        this.state = STATE_FINISHED;

        if(err) {
          log.debug(`actionId=${this.actionId} Aborting (` +
            `action=${this.action}, ` +
            `start=${this.start.format('HH:mm:ss')})`);

          throw err;
        }
      }
    } else {
      throw new Error('no tasks');
    }
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
