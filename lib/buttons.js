'use strict';

const action  = require('./action');
const pigpiod = require('@stheine/pigpiod');

const GPIO_BUTTON_DOWN   = 22; // GPIO22, Pin15 - input - button down
const GPIO_BUTTON_UP     = 27; // GPIO27, Pin13 - input - button up



let globals;

let stateTasterDown = 1;
let stateTasterUp   = 1;


// *************************************************************************
// trigger() - alert handler for Jalousie Inputs
let alertGpioTasterLastTick;
let alertGpioTasterTriggerTick;
const trigger = function(gpio, level, tick) {
  let actionCommand;

  // globals.log.debug(`trigger(${gpio} ${level} ${tick})`);

  const tickSinceLast    = tick - alertGpioTasterLastTick;
  const tickSinceTrigger = tick - alertGpioTasterTriggerTick;

  alertGpioTasterLastTick = tick;

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

  // globals.log.debug(`button ${actionCommand} sinceLast=${tickSinceLast}`);

  // Did they press the Stop button?
  // This causes a 140ms OFF pulse, no matter how long it's pressed,
  // so I can determine this on release.
  if(level &&
     tickSinceTrigger > 135000 && tickSinceTrigger < 150000
  ) {
    // Stop
    globals.log.info(
      `Button JALOUSIE_STOP, ${actionCommand} ${tickSinceTrigger}`);
    stateTasterDown = 1;
    stateTasterUp   = 1;

    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress JALOUSIE_STOP');
    } else {
      action.start(globals, 'JALOUSIE_OFF');
    }
  } else { // !Stop
    // Debounce buttons causing alerts within a short time period.
    if(tickSinceLast < 100000) { // 0.1 second
      // within debounceTime limit
      return;
    }

//    globals.log.debug(`button ${actionCommand} sinceLast=${tickSinceLast}`);

    // Phantom alert, triggering the current value.
    if(gpio === GPIO_BUTTON_UP) {
      if(stateTasterUp === level) {
//        globals.log.info(`phantom (${actionCommand}) ${tickSinceLast}`);

        return;
      }

      stateTasterUp = level;
    } else if(gpio === GPIO_BUTTON_DOWN) {
      if(stateTasterDown === level) {
//        globals.log.info(`phantom (${actionCommand}) ${tickSinceLast}`);

        return;
      }

      stateTasterDown = level;
    }


    // Now I can pass on and handle the trigger.

//    globals.log.debug(`alertGpioTaster(${gpio}, ${level}) ` +
//      `realLevel=${pigpiod.gpio_read(globals.pi, gpio)}`);
//    globals.log.info(`alertGpioTaster(${gpio}, ${level}) ` +
//      `realLevel=${pigpiod.gpio_read(globals.pi, gpio)}`);
//    globals.log.info(`alertGpioTaster(${gpio}, ${level})`);

    globals.log.info(`Button ${actionCommand} sinceLast=${tickSinceLast}`);

    if(globals.flagWindalarm) {
      globals.log.info(`flagWindalarm suppress ${actionCommand}`);
    } else {
      action.start(globals, actionCommand);
    }
  } // Stop

  alertGpioTasterTriggerTick = tick;
};



const init = function(initGlobals) {
  globals = initGlobals;

  // initialize GPIO for Jalousie buttons
  // input, pull-up
  pigpiod.set_mode(globals.pi, GPIO_BUTTON_DOWN, pigpiod.PI_INPUT);
  pigpiod.set_pull_up_down(globals.pi, GPIO_BUTTON_DOWN, pigpiod.PI_PUD_UP);
  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_DOWN, 1);
  pigpiod.set_noise_filter(globals.pi, GPIO_BUTTON_DOWN, 0, 0);

  pigpiod.set_mode(globals.pi, GPIO_BUTTON_UP, pigpiod.PI_INPUT);
  pigpiod.set_pull_up_down(globals.pi, GPIO_BUTTON_UP, pigpiod.PI_PUD_UP);
  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_UP, 1);
  pigpiod.set_noise_filter(globals.pi, GPIO_BUTTON_UP, 0, 0);


  // and attach trigger() to the alert
  if(pigpiod.callback(globals.pi, GPIO_BUTTON_DOWN, pigpiod.EITHER_EDGE,
       trigger) < 0
  ) {
    throw new Error('Failed to callback(pi, GPIO_BUTTON_DOWN)');
  }

  if(pigpiod.callback(globals.pi, GPIO_BUTTON_UP, pigpiod.EITHER_EDGE,
       trigger) < 0
  ) {
    throw new Error('Failed to callback(pi, GPIO_BUTTON_UP)');
  }

  const nowTick = pigpiod.get_current_tick(globals.pi);

  alertGpioTasterLastTick    = nowTick;
  alertGpioTasterTriggerTick = nowTick;
};



const check = function() {
  const currentLevelDown = pigpiod.gpio_read(globals.pi, GPIO_BUTTON_DOWN);
  const currentLevelUp   = pigpiod.gpio_read(globals.pi, GPIO_BUTTON_UP);

  if(stateTasterDown !== currentLevelDown) {
    globals.log.error(`Fix button Down state`);

    trigger(GPIO_BUTTON_DOWN, currentLevelDown,
      pigpiod.get_current_tick(globals.pi));
  }
  if(stateTasterUp   !== currentLevelUp) {
    globals.log.error(`Fix button Up state`);

    trigger(GPIO_BUTTON_UP, currentLevelUp,
      pigpiod.get_current_tick(globals.pi));
  }
};



module.exports = {
  init,
  check
};
