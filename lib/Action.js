/* eslint-disable max-classes-per-file */

'use strict';

const check      = require('check-types');
const delay      = require('delay');
const Gpio       = require('pigpio').Gpio;
const moment     = require('moment');
const nodemailer = require('nodemailer');

const REAL_NO_FAKE = true;

// *************************************************************************
const GPIO_JALOUSIE_DOWN =  4; // GPIO4,  Pin7  - Output - Jalousie down
const GPIO_JALOUSIE_UP   = 17; // GPIO17, Pin11 - Output - Jalousie up

const JALOUSIE_ON    = 1;
const JALOUSIE_OFF   = 0;

// *************************************************************************
const STATE_RUNNING  = 0;
const STATE_FINISHED = 1;
const STATE_ABORT    = 1;



let lastActionId = 0;

class Executor {
  constructor(params) {
    check.assert.object(params);
    check.assert.object(params.gpioJalousieDown);
    check.assert.object(params.gpioJalousieUp);
    check.assert.object(params.log);

    this.actionId         = null;
    this.config           = params.config;
    this.gpioJalousieDown = params.gpioJalousieDown;
    this.gpioJalousieUp   = params.gpioJalousieUp;
    this.log              = params.log;
    this.start            = null;
    this.state            = null;
  }

  logTask(message) {
    return () => {
      this.log.info(message);
    };
  }

  gpioWriteFct(gpio, level) {
    let writeGpio;

    if(REAL_NO_FAKE) {
      switch(gpio) {
        case GPIO_JALOUSIE_DOWN: writeGpio = this.gpioJalousieDown; break;
        case GPIO_JALOUSIE_UP:   writeGpio = this.gpioJalousieUp; break;

        default: throw new Error(`Unhandled gpio ${gpio}`);
      }

      return () => {
        writeGpio.digitalWrite(level);
      };
    }

    return () => {
      /* eslint-disable no-console */
      console.log(`      FAKE          gpio_write(${gpio}, ${level})`);
      /* eslint-enable no-console */
    };
  }

  abort() {
    if(this.state === STATE_RUNNING) {
      // Stopping any output that might be active currently
      this.gpioWriteFct(GPIO_JALOUSIE_UP,   JALOUSIE_OFF)();
      this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF)();

      this.log.debug(`actionId=${this.actionId} Flagging abort (` +
        `task=${this.task}, start=${this.start.format('HH:mm:ss')})`);

      this.state = STATE_ABORT;
    }
  }

  delayFct(milliseconds) {
    return async() => {
      await delay(milliseconds);

      if(this.state === STATE_ABORT) {
        this.log.debug(`actionId=${this.actionId} Cancelling (` +
          `task=${this.task}, ` +
          `start=${this.start.format('HH:mm:ss')})`);

        throw new Error('abort');
      }
    };
  }

  async run(task) {
    check.assert.string(task);

    this.task     = task;
    this.actionId = lastActionId;
    lastActionId++;
    this.start    = moment();
    this.state    = STATE_RUNNING;

//    this.log.debug(`actionId=${this.actionId} Starting (` +
//      `task=${this.task}, start=${this.start.format('HH:mm:ss')})`);

    let steps;

    this.log.debug(`Executor.run(${task})`);

    switch(task) {
      case 'JALOUSIE_OFF':
        steps = [
          this.logTask('Off: ' +
            'JALOUSIE_UP, OFF, JALOUSIE_DOWN, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_STOP':
        // It's ok to signal stop in either direction.
        steps = [
          this.logTask('Stop: JALOUSIE_UP, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_FULL_UP':
        steps = [
          this.logTask('Full up: JALOUSIE_UP, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_FULL_DOWN':
        steps = [
          this.logTask('Full down: JALOUSIE_DOWN, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_UP_ON':
        steps = [
          this.logTask('Up on, JALOUSIE_UP, ON'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
        ];
        break;

      case 'JALOUSIE_UP_OFF':
        steps = [
          this.logTask('Up off, JALOUSIE_UP, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_DOWN_ON':
        steps = [
          this.logTask('Down on, JALOUSIE_DOWN, ON'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
        ];
        break;

      case 'JALOUSIE_DOWN_OFF':
        steps = [
          this.logTask('Down off, JALOUSIE_DOWN, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_SHADOW':
        steps = [
          this.logTask('Shadow-1, down: JALOUSIE_DOWN, ON, 3sec, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(3000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
          this.delayFct(this.config.sun.down.moveSeconds * 1000),
          this.logTask(`Shadow-2, turn: JALOUSIE_UP, ON, ` +
            `${this.config.sun.down.turnMilliseconds}ms, OFF`),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(this.config.sun.down.turnMilliseconds),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.logTask('Shadow-3, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_TURN':
        steps = [
          this.logTask(`Turn-1, turn: JALOUSIE_UP, ON, ` +
            `${this.config.sun.down.turnMilliseconds}ms, OFF`),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(this.config.sun.down.turnMilliseconds),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.logTask('Turn-2, stop: JALOUSIE_DOWN, ON, 140ms, OFF'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(140),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_INDIVIDUAL':
        // Moves the jalousies, set to automatic mode, to their
        // individual shadow state, by immitating the double-click.
        steps = [
          this.logTask('Individual'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(200),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_ALL_DOWN':
        // Moves all jalousies down, by using the alarm function.
        // But this makes them move into the closed position.
        // There is no way to move the manual mode jalousies into
        // the shadown position.
        steps = [
          this.logTask('All down'),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_ON),
          this.delayFct(5000),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_ALL_UP':
        // Moves all jalousies up, by using the alarm function.
        steps = [
          this.logTask('All up'),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_ON),
          this.delayFct(5000),
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
        ];
        break;

      case 'JALOUSIE_SPECIAL_TEST':
        steps = [
          this.logTask('Special test'),
        ];
        break;

      default:
        this.log.error(`Unhandled task=${task}`);
        break;
    }

    if(steps) {
      // Stop all outputs to start with a defined state,
      // even if a task was cancelled in between.
      try {
        for(const step of [
          this.gpioWriteFct(GPIO_JALOUSIE_UP, JALOUSIE_OFF),
          this.gpioWriteFct(GPIO_JALOUSIE_DOWN, JALOUSIE_OFF),
        ].concat(steps)) {
          await step();
        }

        this.state = STATE_FINISHED;

//          this.log.debug(`actionId=${this.actionId} Finished (` +
//            `task=${this.task}, ` +
//            `start=${this.start.format('HH:mm:ss')})`);
      } catch(err) {
        this.state = STATE_FINISHED;

        if(err) {
          this.log.debug(`actionId=${this.actionId} Aborting (` +
            `task=${this.task}, ` +
            `start=${this.start.format('HH:mm:ss')})`);

          throw err;
        }
      }
    } else {
      throw new Error('no steps');
    }
  }
}

class Action {
  constructor(params) {
    check.assert.object(params);
    check.assert.object(params.config);
    check.assert.object(params.log);

    this.config           = params.config;
    this.log              = params.log;

    this.actionThread     = undefined;

    if(REAL_NO_FAKE) {
      try {
        this.gpioJalousieUp   = new Gpio(GPIO_JALOUSIE_UP,   {mode: Gpio.OUTPUT});
        this.gpioJalousieDown = new Gpio(GPIO_JALOUSIE_DOWN, {mode: Gpio.OUTPUT});
      } catch(err) {
        if(err.message === 'pigpio error -1 in gpioInitialise') {
          (async() => {
            this.log.error('pigpio startup failed. Need to reboot.');

            let transport = nodemailer.createTransport({host: 'postfix', port: 25});

            transport.sendMail({
              to:      'stefan@heine7.de',
              subject: 'Jalousie startup failed',
              html:    `
                <p>Jalousie startup failed.</p>
                <p>Probably need to reboot.</p>
                <p><pre>${JSON.stringify(err)}</pre></p>
              `,
            });

            throw new Error('pigpio startup failed. Need to reboot.');
          })();
        } else {
          throw err;
        }
      }
    } else {
      this.gpioJalousieUp   = {FAKE: true};
      this.gpioJalousieDown = {FAKE: true};
    }
  }

  async start(task) {
    check.assert.string(task);

    if(this.actionThread) {
      this.actionThread.abort();
      this.actionThread = undefined;
    }

    this.actionThread = new Executor(this);

    try {
      await this.actionThread.run(task);
    } catch(err) {
      this.log.info('task aborted', err);
    }
  }
}

module.exports = Action;
