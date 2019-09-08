'use strict';

/* eslint-disable complexity */
/* eslint-disable max-statements */

const Gpio    = require('pigpio').Gpio;
const moment  = require('moment');

const status  = require('./status');

// const RAIN_RING_BUFFER_LENGTH = 6;

// The Rain sensor is connected to the Raspi GPIO_RAIN
// and is triggering an interrupt/ callback function to
// calculate the amount of rain per day.
const GPIO_RAIN            = 7; // Pin 26 / GPIO7 - Rain

let   triggerLowTime;
let   triggerLastTime = moment();
let   log;
let   rainLevel;

// Pull-up, normalerweise High - beim kippen Low
// High
// High
// High - Wippe kippt
// Low  - Wippe wippt
// High - Wippe angekommen
// High
// High
const init = async function(globals) {
  log = globals.log;

  const oldStatus = await status.read();

  rainLevel = oldStatus.rainLevel || 0;

  const gpioRain = new Gpio(GPIO_RAIN, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,
//    edge:       Gpio.EITHER_EDGE, // interrupt on either edge
//    timeout:     xxx milliseconds  // interrupt only
  });

  gpioRain.glitchFilter(10); // for alert only

  gpioRain.on('interrupt', level => {
    log.debug(`triggerWind interrupt raw(${level})`);
  });

  gpioRain.on('alert', level => {
//    log.debug(`triggerRain(${level})`);

    const now = moment();
    let   triggerDuration;

    switch(level) {
// TODO interrupt/ alert/ timeout     case Gpio.TIMEOUT:
//        log.debug('Interrupt watchdog timeout');
//
//        return;

      case 0:
        if(triggerLowTime) {
          log.warn('triggerLowTime set on down edge');
        }

        triggerLowTime = now;

        return;

      case 1:
        if(!triggerLowTime) {
          log.warn('triggerLowTime missing on up edge');
          triggerLowTime = now;
        }

        triggerDuration = now.diff(triggerLowTime);
        triggerLowTime = null;

        break;

      default:
        log.error(`Unhandled level ${level}`);

        return;
    }

    const diffSinceLast = now.diff(triggerLastTime); // milliseconds

    triggerLastTime = now;

    if(diffSinceLast < 60000) {
      // Phantominterrupt (> 1/min)
//      log.debug(`Suppressing rain phantom interrupt for diffSinceLast=${diffSinceLast}ms`);

      return;
    }
    if(triggerDuration < 50) {
      // Phantominterrupt (> 1/min)
      log.debug(`Suppressing rain phantom interrupt for triggerDuration=${triggerDuration}ms`); // TODO comment

      return;
    }

//    log.warn(`triggerRain(${level} diff=${diffSinceLast}ms duration=${triggerDuration}ms)`); // TODO comment

    rainLevel += 0.44;
  });
};



const getRain = async function() {
  return {rainLevel};
};



module.exports = {
  init,
  getRain,
};
