'use strict';

const Gpio   = require('pigpio').Gpio;

const GPIO_BUTTON_DOWN   = 22; // GPIO22, Pin15 - input - button down
const GPIO_BUTTON_UP     = 27; // GPIO27, Pin13 - input - button up

let globals;

let stateTasterDown = 1;
let stateTasterUp   = 1;

let gpioButtonDown; // TODO object
let gpioButtonUp;

// *************************************************************************
// trigger() - alert handler for Jalousie Inputs
let alertButtonLastDate;
let alertButtonTriggerDate;
const triggerButton = function(gpio, level) {
  const now = new Date();

  let actionCommand;

//  globals.log.debug(`triggerButton(${gpio} ${level})`);

  const sinceLast    = now - alertButtonLastDate;
  const sinceTrigger = now - alertButtonTriggerDate;

  alertButtonLastDate = now;

  switch(gpio) {
    case GPIO_BUTTON_UP:
      actionCommand = 'JALOUSIE_UP_';
      break;

    case GPIO_BUTTON_DOWN:
      actionCommand = 'JALOUSIE_DOWN_';
      break;

    default:
      globals.log.error(`Unhandled alert trigger gpio=${gpio}`);

      return;
  }

  if(level) {
    actionCommand += 'OFF';
  } else {
    actionCommand += 'ON';
  }

  // globals.log.debug(`button ${actionCommand} sinceLast=${sinceLast}`);

  // Did they press the Stop button?
  // This causes a 140ms OFF pulse, no matter how long it's pressed,
  // so I can determine this on release.
  if(level && sinceTrigger > 135 && sinceTrigger < 150) {
    // Stop
    globals.log.info(`Button JALOUSIE_STOP, ${actionCommand} ${sinceTrigger}`);
    stateTasterDown = 1;
    stateTasterUp   = 1;

    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress JALOUSIE_STOP');
    } else {
      globals.action.start('JALOUSIE_OFF');
    }
  } else { // !Stop
    // Debounce buttons causing alerts within a short time period.
    if(sinceLast < 100) { // 0.1 second
      // within debounceTime limit
      return;
    }

//    globals.log.debug(`button ${actionCommand} sinceLast=${sinceLast}`);

    // Phantom alert, triggering the current value.
    if(gpio === GPIO_BUTTON_UP) {
      if(stateTasterUp === level) {
//        globals.log.info(`phantom (${actionCommand}) ${sinceLast}`);

        return;
      }

      stateTasterUp = level;
    } else if(gpio === GPIO_BUTTON_DOWN) {
      if(stateTasterDown === level) {
//        globals.log.info(`phantom (${actionCommand}) ${sinceLast}`);

        return;
      }

      stateTasterDown = level;
    }

    // Now I can pass on and handle the trigger.
    globals.log.info(`Button ${actionCommand} sinceLast=${sinceLast}`);

    if(globals.flagWindalarm) {
      globals.log.info(`flagWindalarm suppress ${actionCommand}`);
    } else {
      globals.action.start(actionCommand);
    }
  } // Stop

  alertButtonTriggerDate = now;
};



const init = function(initGlobals) {
  globals = initGlobals;

  // initialize GPIO for Jalousie buttons
  // input, pull-up
  gpioButtonDown = new Gpio(GPIO_BUTTON_DOWN, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,
//    edge:       Gpio.EITHER_EDGE, // interrupt on either edge
//    timeout:    xxx milliseconds  // interrupt only
  });

  gpioButtonDown.glitchFilter(10);

  gpioButtonUp = new Gpio(GPIO_BUTTON_UP, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,
//    edge:       Gpio.EITHER_EDGE, // interrupt on either edge
//    timeout:    xxx milliseconds  // interrupt only
  });

  gpioButtonUp.glitchFilter(10);

  // and attach trigger() to the alert
  gpioButtonDown.on('alert', level => triggerButton(GPIO_BUTTON_DOWN, level));
  gpioButtonUp.on('alert',   level => triggerButton(GPIO_BUTTON_UP, level));

  const now = new Date();

  alertButtonLastDate    = now;
  alertButtonTriggerDate = now;
};



const check = function() {
  const currentLevelDown = gpioButtonDown.digitalRead();
  const currentLevelUp   = gpioButtonUp.digitalRead();

  if(stateTasterDown !== currentLevelDown) {
    globals.log.error(`Fix button Down state`);

    triggerButton(GPIO_BUTTON_DOWN, currentLevelDown);
  }
  if(stateTasterUp   !== currentLevelUp) {
    globals.log.error(`Fix button Up state`);

    triggerButton(GPIO_BUTTON_UP, currentLevelUp);
  }
};



module.exports = {
  init,
  check,
};
