'use strict';

/* eslint-disable complexity */
/* eslint-disable max-statements */

// https://www.npmjs.com/package/@stheine/ringbufferjs
const Ringbuffer = require('@stheine/ringbufferjs');
// http://momentjs.com/docs
const moment  = require('moment');

// https://www.npmjs.com/package/@stheine/pigpiod
const pigpiod = require('@stheine/pigpiod');

const {logDebug, logInfo, logError} = require('./troubleshooting');

const WIND_RING_BUFFER_LENGTH = 6;

const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder



// The Wind sensor is connected to the Raspi GPIO_WIND
// and is triggering an interrupt/ callback function to count
// the number of events, calculating the rate per second.
const windRingbufferTicks   = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
const windRingbufferCounter = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
let   windLastThreshold;
let   windLastTicks;
let   windCounter           = 0;
let   windTriggerLastTick   = 0;


const reset = function() {
  windCounter = 0;
};



const trigger = function(pi, gpio, level, tick) {
  if(level === pigpiod.PI_TIMEOUT) {
    logDebug('Interrupt watchdog timeout');

    return;
  }

  const tickSinceLast = tick - windTriggerLastTick;

  windTriggerLastTick = tick;
  if(tickSinceLast < 10000) {
    // Phantominterrupt (> 100Hz)
    logDebug('Supressing wind phantom interrupt');

    return;
  }

  windCounter++;
};



// TODO do I need this function? or do I translate this module into a class?
// set GPIO wind to generate an interrupt on high-to-low transitions
// and attach intrGpioWind() to the interrupt
const initialize = function(pi) {
  if(pigpiod.callback(pi, GPIO_WIND, pigpiod.FALLING_EDGE, trigger) < 0) {
    logError('Failed to callback(pi, GPIO_WIND)');

    throw new Error('Failed to register callback for wind.trigger()');
  }
};



const getThreshold = function(pi) {
  return new Promise(resolve => {
    let   windThreshold;
    const nowTicks           = pigpiod.get_current_tick(pi);
    const windCounterCurrent = windCounter;

//    logDebug(`windCounter=${windCounter}`);

    reset();

    if(!windLastTicks) {
      logInfo('Initialize WindCounter');

      windLastTicks       = pigpiod.get_current_tick(pi);
      windTriggerLastTick = pigpiod.get_current_tick(pi);
      windRingbufferCounter.enq(windCounterCurrent);
      windRingbufferTicks.enq(nowTicks);

      return resolve({
        threshold: 0,
        timestamp: moment()
      });
    }

    // Remove outdated values from the ringbuffer.
    while(windRingbufferTicks.size() &&
          (nowTicks - windRingbufferTicks.peek()) >
            (WIND_RING_BUFFER_LENGTH + 5) * 1000000
    ) {
      logDebug('Removing outdated value from wind ringbuffer');
      windRingbufferCounter.deq();
      windRingbufferTicks.deq();
    }

    // Versuche Ausreisser (wilde Interrupts) zu erkennen, indem ich den neuen
    // Wert mit der Summe der letzten Werte vergleiche.
    // Ist er > 10 (damit nicht alle Werte ausgeschlossen werden, da die
    // initiale Summe 0 ist) und höher, als die Summe der letzten Werte,
    // so nehme ich an, das es ein Ausreißer ist.
    let summeWindCounterVals;

    if(!windRingbufferCounter.size()) {
      logInfo('WindRingBuffer leer, keine Prüfung auf Ausreißer.');
    } else {
      summeWindCounterVals = windRingbufferCounter.sum();

      if(windCounterCurrent > 10 &&
         windCounterCurrent > summeWindCounterVals
      ) {
        // Ausreisser
        logInfo(`WindCounter Ausreisser ${windCounterCurrent} ` +
          `(summeWindCounterVals=${summeWindCounterVals}, ` +
          `size=${windRingbufferCounter.size()})`);

        return resolve({
          threshold: windLastThreshold,
          timestamp: moment()
        });
      }
    }

    // Kein Ausreisser, also im RingBuffer speichern.
    windRingbufferCounter.enq(windCounterCurrent);
    windRingbufferTicks.enq(nowTicks);

    const windTicksSinceLast = nowTicks - windLastTicks;
    const windSecondsSinceLast = windTicksSinceLast / 1000000;
    const windHertz = windCounterCurrent / windSecondsSinceLast;
  //  logDebug(`windTicksSinceLast=${windTicksSinceLast}\n` +
  //    `  windSecondsSinceLast=${windSecondsSinceLast}\n` +
  //    `  windHertz=${windHertz}`);

    windLastTicks = pigpiod.get_current_tick(pi);

    if(windHertz <= 2.00) {
      windThreshold = 0;
    } else if(windHertz <= 5.78) {
      windThreshold = 1;
    } else if(windHertz <= 9.56) {
      windThreshold = 2;
    } else if(windHertz <= 13.34) {
      windThreshold = 3;
    } else if(windHertz <= 17.12) {
      windThreshold = 4;
    } else if(windHertz <= 20.90) {
      windThreshold = 5;
    } else if(windHertz <= 24.68) {
      windThreshold = 6;
    } else if(windHertz <= 28.46) {
      windThreshold = 7;
    } else if(windHertz <= 32.24) {
      windThreshold = 8;
    } else if(windHertz <= 36.02) {
      windThreshold = 9;
    } else if(windHertz <= 39.80) {
      windThreshold = 10;
    } else {
      windThreshold = 11;
    }
//  logDebug(`windThreshold=${windThreshold}\n` +
//    `  Wind: ${windThreshold} ` +
//    `  ${windCounterCurrent}/${windSecondsSinceLast} (${windHertz}Hz)`);

    if(windLastThreshold !== windThreshold &&
       windThreshold > 1
    ) {
//    logInfo(`windThreshold=${windThreshold}\n` +
//      `  Wind: ${windThreshold} ` +
//      `  ${windCounterCurrent}/${windSecondsSinceLast} (${windHertz}Hz)`);
      windLastThreshold = windThreshold;
    }

    return resolve({
      threshold: windThreshold,
      timestamp: moment()
    });
  });
};



module.exports = {
  initialize,
  getThreshold,
  trigger
};
