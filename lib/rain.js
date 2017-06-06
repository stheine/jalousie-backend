'use strict';

/* eslint-disable complexity */
/* eslint-disable max-statements */

// const Ringbuffer = require('@stheine/ringbufferjs');
const moment  = require('moment');

const pigpiod = require('@stheine/pigpiod');

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
const trigger = function(gpio, level) { // , tick) {
//  log.debug(`trigger(${gpio} ${level} ${tick})`);

  const now = moment();
  let   triggerDuration;

  switch(level) {
    case pigpiod.PI_TIMEOUT:
      log.debug('Interrupt watchdog timeout');

      return;

    case pigpiod.PI_LOW:
      if(triggerLowTime) {
        log.warn('triggerLowTime set on down edge');
      }

      triggerLowTime = now;

      return;

    case pigpiod.PI_HIGH: {
      if(!triggerLowTime) {
        log.warn('triggerLowTime missing on up edge');
        triggerLowTime = now;
      }

      triggerDuration = now.diff(triggerLowTime);
      triggerLowTime = null;
      break;
    }

    default:
      log.error(`Unhandled level ${level}`);

      return;
  }

  const diffSinceLast = now.diff(triggerLastTime); // milliseconds

  triggerLastTime = now;

  if(diffSinceLast < 60000) {
    // Phantominterrupt (> 1/min)
    log.debug(`Suppressing rain phantom interrupt for diffSinceLast=${diffSinceLast}ms`); // TODO comment

    return;
  }
  if(triggerDuration < 50) {
    // Phantominterrupt (> 1/min)
    log.debug(`Suppressing rain phantom interrupt for triggerDuration=${triggerDuration}ms`); // TODO comment

    return;
  }

  log.warn(`trigger(${gpio} ${level} diff=${diffSinceLast}ms duration=${triggerDuration}ms)`); // TODO comment

  rainLevel += 0.44;
};



const init = function(globals) {
  log = globals.log;

  status.read().then(oldStatus => {
    rainLevel = oldStatus.rainLevel || 0;

    pigpiod.set_mode(globals.pi,          GPIO_RAIN, pigpiod.PI_INPUT);
    pigpiod.set_pull_up_down(globals.pi,  GPIO_RAIN, pigpiod.PI_PUD_UP);
//    pigpiod.set_glitch_filter(globals.pi, GPIO_RAIN, 5);

    if(pigpiod.callback(globals.pi, GPIO_RAIN, pigpiod.EITHER_EDGE, trigger) < 0) {
      throw new Error('Failed to register callback for rain.trigger()');
    }
  })
  .catch(err => {
    throw err;
  });
};



const getRain = function() {
  return new Promise(resolve => {
    resolve({rainLevel});
  });
};



module.exports = {
  init,
  getRain
};
