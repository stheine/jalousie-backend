'use strict';

const pigpiod    = require('../../pigpiod'); // TODO switch to git installed module

const {logDebug, logInfo} = require('./troubleshooting'); // TODO module

// https://github.com/stheine/ringbufferjs
const Ringbuffer = require('ringbufferjs');

const WIND_RING_BUFFER_LENGTH = 6;


// The Wind sensor is connected to the Raspi GPIO_WIND
// and is triggering an interrupt/ callback function to count
// the number of events, calculating the rate per second.
const windRingbufferTicks   = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
const windRingbufferCounter = new Ringbuffer(WIND_RING_BUFFER_LENGTH);
let   windLastThreshold     = -1;
let   windLastTicks         = -1;
let   windCounter           = 0;
let   windTriggerLastTick   = 0;


const reset = function(pi) {
  windCounter = 0;
};



const trigger = function(gpio, level, tick) {
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



const getWindThreshold = function(pi) {
  return new Promise((resolve, reject) => {
    let   windschwelle;
    const nowTicks           = pigpiod.get_current_tick(pi);
    const windCounterCurrent = windCounter;

    logDebug(`windCounter=${windCounter}`);

    reset();

    if(windLastTicks === -1) {
      logInfo("Initialize WindCounter");

      windLastTicks       = pigpiod.get_current_tick(pi);
      windTriggerLastTick = pigpiod.get_current_tick(pi);
      windRingbufferCounter.enq(windCounterCurrent);
      windRingbufferTicks.enq(nowTicks);

      return resolve(0);
    }

    // Remove outdated values from the ringbuffer.
    while(windRingbufferTicks.size() &&
          (nowTicks - windRingbufferTicks.peek()) >
            (WIND_RING_BUFFER_LENGTH + 1) * 1000000
    ) {
      logDebug('Removing outdated value from wind wingbuffer');
      windRingbufferCounter.deq();
      windRingbufferTicks.deq();
    }

    // Versuche Ausreisser (wilde Interrupts) zu erkennen, indem ich den neuen
    // Wert mit der Summe der letzten Werte vergleiche.
    // Ist er > 10 (damit nicht alle Werte ausgeschlossen werden, da die
    // initiale Summe 0 ist) und höher, als die Summe der letzten Werte,
    // so nehme ich an, das es ein Ausreißer ist.
    let summeWindCounterVals;

    if(windRingbufferCounter.size() == 0) {
      logInfo("WindRingBuffer leer, keine Prüfung auf Ausreißer.");
    } else {
      summeWindCounterVals = windRingbufferCounter.sum();

      if(windCounterCurrent > 10 &&
         windCounterCurrent > summeWindCounterVals
      ) {
        // Ausreisser
        logInfo("WindCounter Ausreisser %d (summeWindCounterVals=%d, size=%d)",
          windCounterCurrent, summeWindCounterVals, windRingbufferCounter.size());

        return resolve(windLastThreshold);
      }
    }

    // Kein Ausreisser, also im RingBuffer speichern.
    windRingbufferCounter.enq(windCounterCurrent);
    windRingbufferTicks.enq(nowTicks);

    const windTicksSinceLast = nowTicks - windLastTicks;
  //  trace("windTicksSinceLast=%d", windTicksSinceLast);
    const windSecondsSinceLast = windTicksSinceLast / 1000000;
  //  trace("windSecondsSinceLast=%f", windSecondsSinceLast);
    const windHertz = windCounterCurrent / windSecondsSinceLast;
  //  trace("windHertz=%f", windHertz);

    windLastTicks = pigpiod.get_current_tick(pi);

    if(windHertz <= 2.00) {
      windschwelle = 0;
    } else if(windHertz <= 5.78) {
      windschwelle = 1;
    } else if(windHertz <= 9.56) {
      windschwelle = 2;
    } else if(windHertz <= 13.34) {
      windschwelle = 3;
    } else if(windHertz <= 17.12) {
      windschwelle = 4;
    } else if(windHertz <= 20.90) {
      windschwelle = 5;
    } else if(windHertz <= 24.68) {
      windschwelle = 6;
    } else if(windHertz <= 28.46) {
      windschwelle = 7;
    } else if(windHertz <= 32.24) {
      windschwelle = 8;
    } else if(windHertz <= 36.02) {
      windschwelle = 9;
    } else if(windHertz <= 39.80) {
      windschwelle = 10;
    } else {
      windschwelle = 11;
    }
  //  trace("windschwelle=%d", windschwelle);

  //  trace("Wind:  %d %d/%3.1f (%05.2fHz)", windschwelle, windCounterCurrent,
  //    windSecondsSinceLast, windHertz);

// TODO    writeStatus("windschwelle", FMT_INT_02, (void *)&windschwelle);
// TODO    writeStatus("windHertz",    FMT_FLOAT_05_2, (void *)&windHertz);

    if(windLastThreshold !== windschwelle &&
       windschwelle > 1
    ) {
  //    logInfo("Windschwelle: %02d / #%d/%3.1fs / %05.2fHz",
  //      windschwelle, windCounterCurrent, windSecondsSinceLast, windHertz);
      windLastThreshold = windschwelle;
    }

    return resolve(windschwelle);
  });
}



module.exports = {
  trigger,
  getWindThreshold
};
