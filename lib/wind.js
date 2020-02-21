'use strict';

const Gpio       = require('pigpio').Gpio;
const moment     = require('moment');
const Ringbuffer = require('@stheine/ringbufferjs');

const WIND_RING_BUFFER_LENGTH = 6;

const GPIO_WIND               = 25; // Pin 22 / GPIO25 - Windmelder

// The Wind sensor is connected to the Raspi GPIO_WIND
// and is triggering an interrupt/ callback function to count
// the number of events, calculating the rate per second.
const windRingbufferDates   = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
const windRingbufferCounter = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
let   windLastThreshold;
let   windInterruptLastTick;
let   windLastDate;
let   windCounter           = 0;
let   windTriggerLastDate   = 0;
let   log;

const reset = function() {
  windCounter = 0;
};

const init = function(globals) { // TODO class
  const now = new Date();

  log = globals.log;

  windLastDate          = now;
  windTriggerLastDate   = now;
  windInterruptLastTick = null;
  windRingbufferCounter.enq(0);
  windRingbufferDates.enq(now);

  const gpioWind = new Gpio(GPIO_WIND, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,              // alert on any level change
//    edge:       Gpio.FALLING_EDGE, // interrupt on falling edge
//    timeout:    xxx milliseconds  // interrupt only
  });

  gpioWind.glitchFilter(10); // for alert only

  gpioWind.on('alert', level => {
//    log.debug(`triggerWind alert raw(${level})`);

    if(level) {
      // Ignore rising, count only falling edge.
      return;
    }

    const nowAlert = new Date();

    const sinceLast = nowAlert - windTriggerLastDate;

    windTriggerLastDate = nowAlert;
    if(sinceLast < 10) {
      // Phantominterrupt (> 100Hz)
      log.debug('Suppressing wind phantom interrupt', sinceLast);

      return;
    }

    windCounter++;

//    log.debug(`triggerWind()`, {sinceLast, hz: 1000/sinceLast, windCounter});
  });
};



const getThreshold = async function(globals) {
  let   windThreshold;
  const now                = new Date();
  const windCounterCurrent = windCounter;

//  globals.log.debug(`windCounter=${windCounter}`);

  reset();

  if(!windLastDate) {
    throw new Error('Missing wind.init()');
  }

  // Remove outdated values from the ringbuffer.
  while(
    windRingbufferDates.size() &&
    (now - windRingbufferDates.peek()) > (WIND_RING_BUFFER_LENGTH + 15) * 1000
  ) {
//    globals.log.debug('Removing outdated value from wind ringbuffer');
    windRingbufferCounter.deq();
    windRingbufferDates.deq();
  }

  // Versuche Ausreisser (wilde Interrupts) zu erkennen, indem ich den neuen
  // Wert mit der Summe der letzten Werte vergleiche.
  // Ist er > 10 (damit nicht alle Werte ausgeschlossen werden, da die
  // initiale Summe 0 ist) und höher, als die Summe der letzten Werte,
  // so nehme ich an, das es ein Ausreißer ist.
  let summeWindCounterVals;

  if(!windRingbufferCounter.size()) {
    globals.log.info('WindRingBuffer leer, keine Prüfung auf Ausreißer.');
  } else {
    summeWindCounterVals = windRingbufferCounter.sum();

    if(windCounterCurrent > 10 &&
       windCounterCurrent > (summeWindCounterVals * 2)
    ) {
      // Ausreisser
      globals.log.info(`WindCounter Ausreisser ${windCounterCurrent} ` +
        `(summeWindCounterVals*2=${summeWindCounterVals * 2}, ` +
        `size=${windRingbufferCounter.size()})\n` +
        `windRingbufferCounter = ` +
        `${JSON.stringify(windRingbufferCounter.dump(), null, '  ')}`);

      return {
        threshold: windLastThreshold,
        timestamp: moment(),
      };
    }
  }

  // Kein Ausreisser, also im RingBuffer speichern.
  windRingbufferCounter.enq(windCounterCurrent);
  windRingbufferDates.enq(now);

  const sinceLast = now - windLastDate;
  const windSecondsSinceLast = sinceLast / 1000;
  const windHertz = windCounterCurrent / windSecondsSinceLast;
//  globals.log.debug(`sinceLast=${sinceLast}\n` +
//    `  windSecondsSinceLast=${windSecondsSinceLast}\n` +
//    `  windHertz=${windHertz}`);

  windLastDate = new Date();

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

//  globals.log.debug(
//    `  sinceLast=${sinceLast} ` +
//    `  windThreshold=${windThreshold} ` +
//    `  ${windCounterCurrent}/${windSecondsSinceLast} (${windHertz}Hz)`);

  if(windLastThreshold !== windThreshold &&
     windThreshold > 1
  ) {
//    globals.log.info(`windThreshold=${windThreshold}\n` +
//      `  Wind: ${windThreshold} ` +
//      `  ${windCounterCurrent}/${windSecondsSinceLast} (${windHertz}Hz)`);
    windLastThreshold = windThreshold;
  }

  if(windThreshold >= globals.config.wind.up.threshold) {
    globals.log.debug(`windCounterCurrent = ${windCounterCurrent}\n` +
      `windSecondsSinceLast = ${windSecondsSinceLast}\n` +
      `windHertz = ${windHertz}\n` +
      `windThreshold = ${windThreshold}\n` +
      `windRingbufferCounter = ` +
      `${JSON.stringify(windRingbufferCounter.dump(), null, '  ')}`);
  }

  return {
    counter:   windCounterCurrent,
    threshold: windThreshold,
    timestamp: moment(),
  };
};



module.exports = {
  init,
  getThreshold,
};
