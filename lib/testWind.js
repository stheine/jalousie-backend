'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module

const wind     = require('./wind');



const GPIO_WIND            = 25; // Pin 22 / GPIO25 - Windmelder

// *********************************************************************************
// Globals

// Connection to pigpiod
let pi                     = -1;



// *********************************************************************************
// intrGpioWind() - Interrupt handler for wind sensor
let intrGpioWindLastTick = -1;
const intrGpioWind = function(pi, userGpio, level, tick) {
  let tickSinceLast;

  if(intrGpioWindLastTick === -1) {
    intrGpioWindLastTick = pigpiod.get_current_tick(pi);
    reset();

    return;
  }

  if(level != pigpiod.PI_TIMEOUT) {
    tickSinceLast        = tick - intrGpioWindLastTick;
    intrGpioWindLastTick = tick;
    if(tickSinceLast < 10000) {
      // Phantominterrupt (> 100Hz)
      return;
    }
//    else if(tickSinceLast < 100000) {
//      logMsg("Interrupt Windsensor tick=%zu", tickSinceLast);
//    }
  }

  wind.trigger();
}



// *********************************************************************************
// main()

// sets up the pigpio library
if((pi = pigpiod.pigpio_start()) < 0) {
  console.log("Failed to pigpio_start()");
  return(1);
}

// initialize GPIO for Jalousie
// TODO pigpiod.set_mode(pi, GPIO_WIND, PI_INPUT);
// TODO pigpiod.set_pull_up_down(pi, GPIO_WIND, PI_PUD_UP);

// set GPIO wind to generate an interrupt on high-to-low transitions
// and attach intrGpioWind() to the interrupt
if(pigpiod.callback(pi, GPIO_WIND, pigpiod.FALLING_EDGE, wind.trigger) < 0) {
  console.log("Failed to callback(pi, GPIO_WIND)");
  return(1);
}

// Das ist die zentrale Schleife, die einmal pro Sekunde alle Werte holt und
// darauf agiert.
setInterval(() => {
  // read wind data, as collected by interrupt handler
  wind.getWindThreshold(pi)
  .then(windThreshold => {
    console.log(`windThreshold = ${windThreshold}`);
  });
}, 1000);
