'use strict';

const action  = require('./action');
const pigpiod = require('@stheine/pigpiod');

const GPIO_BUTTON_DOWN   = 22; // GPIO22, Pin15 - Input  - Taster runter
const GPIO_BUTTON_UP     = 27; // GPIO27, Pin13 - Input  - Taster hoch



let globals;

// Tasten
let stateTasterRunter = 1;
let stateTasterHoch   = 1;


// *************************************************************************
// trigger() - Interrupt handler for Jalousie Inputs
let intrGpioTasterLastTick;
let intrGpioTasterTriggerTick;
const trigger = function(gpio, level, tick) {
  let actionCommand;

  //  globals.log.debug(`trigger(${gpio} ${level} ${tick})`);

  if(!intrGpioTasterLastTick || !intrGpioTasterTriggerTick) {
    intrGpioTasterLastTick    = tick;
    intrGpioTasterTriggerTick = tick;

    return;
  }
  const tickSinceLast    = tick - intrGpioTasterLastTick;
  const tickSinceTrigger = tick - intrGpioTasterTriggerTick;

  intrGpioTasterLastTick = tick;

  switch(gpio) {
    case GPIO_BUTTON_UP:
      actionCommand = 'JALOUSIE_UP_';
      break;

    case GPIO_BUTTON_DOWN:
      actionCommand = 'JALOUSIE_DOWN_';
      break;

    default:
      globals.log.error(`Unhandled interrupt trigger gpio=${gpio}`);

      return;
  }

  if(level) {
    actionCommand += 'OFF';
  } else {
    actionCommand += 'ON';
  }

  // War dies die Stop Taste? Diese laesst fix nach ~140ms los,
  // daher kann ich sie beim Loslassen recht gut erkennen.
  if(level &&
     tickSinceTrigger > 140000 && tickSinceTrigger < 150000
  ) {
    // Stop
    globals.log.info(
      `Button JALOUSIE_STOP, ${actionCommand} ${tickSinceTrigger}`);
    stateTasterHoch   = 1;
    stateTasterRunter = 1;

    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress JALOUSIE_STOP');
    } else {
      action.start(globals, 'JALOUSIE_OFF');
    }
  } else { // Stop
    // Logik um falsche Interrupts zu unterdruecken.
    // Prellende Tasten.
    if(tickSinceLast < 100000) {
      // Mehrere Tastendruecke innerhalb 0.5 Sekunde. Prellt.

      // within debounceTime limit
//      if(tickSinceLast > 1000) {
//        // log the longer ones only
//        globals.log.info(`debounce (${actionCommand}) ` +
//              `${tickSinceLast} ${tick}`);
//      }

      return;
    }
//    else {
//      time_sleep(0.000050) // 50us
// TODO    }



    // 'Taster Losgelassen', obwohl er noch gedrueckt ist, nach ~280ms.
    if(level &&
       tickSinceLast > 260000 && tickSinceLast < 300000
    ) {
      // Hier warte ich lieber mal kurz und frage den echten Wert nochmal ab.
// TODO      time_sleep(0.000100); // 100us
//      realLevel = pigpiod.gpio_read(globals.pi, gpio);
//      if(realLevel != level) {
//        globals.log.info(
//          `additional debounce (${actionCommand}) ` +
//          `${tickSinceLast}`);
//
//        return;
//      } else {
      globals.log.info(
        `tja (${actionCommand}) ${tickSinceLast}`);
//      }
    }



    // Phantom Interrupts, auf den Wert, auf dem die Taste sowieso schon steht.
    if(gpio === GPIO_BUTTON_UP) {
      if(stateTasterHoch === level) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        globals.log.info(
          `phantom (${actionCommand}) ${tickSinceLast}`);

        return;
      }
      stateTasterHoch = level;
//      stateTasterHoch = pigpiod.gpio_read(globals.pi, GPIO_BUTTON_UP);
    } else if(gpio === GPIO_BUTTON_DOWN) {
      if(stateTasterRunter === level) {
        // Interrupt auf einen Wert, auf dem die Taste sowieso schon steht.
        globals.log.info(
          `phantom (${actionCommand}) ${tickSinceLast}`);

        return;
      }
      stateTasterRunter = level;
//      stateTasterRunter = pigpiod.gpio_read(globals.pi, GPIO_BUTTON_DOWN);
    }


    // Jetzt kann ich die Tastendruck weitergeben.

//    globals.log.debug(`intrGpioTaster(${gpio}, ${level}) ` +
//      `realLevel=${pigpiod.gpio_read(globals.pi, gpio)}`);
//    globals.log.info(`intrGpioTaster(${gpio}, ${level}) ` +
//      `realLevel=${pigpiod.gpio_read(globals.pi, gpio)}`);
    globals.log.info(`intrGpioTaster(${gpio}, ${level})`);

    globals.log.info(`Taster ${actionCommand} ${tickSinceLast}`);

    if(globals.flagWindalarm) {
      globals.log.info(`flagWindalarm unterdrueckt ${actionCommand}`);
    } else {
      action.start(globals, actionCommand);
    }
  } // Stop

  intrGpioTasterTriggerTick = tick;
};



const init = function(initGlobals) {
  globals = initGlobals;

  // initialize GPIO for Jalousie buttons
  // input, pull-up
  pigpiod.set_mode(globals.pi, GPIO_BUTTON_DOWN, pigpiod.PI_INPUT);
  pigpiod.set_pull_up_down(globals.pi, GPIO_BUTTON_DOWN, pigpiod.PI_PUD_UP);
//  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_DOWN, 50);
  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_DOWN, 5);
//  pigpiod.set_noise_filter(globals.pi, GPIO_BUTTON_DOWN, 50, 50);

  pigpiod.set_mode(globals.pi, GPIO_BUTTON_UP, pigpiod.PI_INPUT);
  pigpiod.set_pull_up_down(globals.pi, GPIO_BUTTON_UP, pigpiod.PI_PUD_UP);
//  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_UP, 50);
  pigpiod.set_glitch_filter(globals.pi, GPIO_BUTTON_UP, 5);
//  pigpiod.set_noise_filter(globals.pi, GPIO_BUTTON_UP, 50, 50);


  // and attach trigger() to the interrupt
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
};



module.exports = {
  init
};
