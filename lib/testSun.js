#!/usr/bin/env node

'use strict';

/* eslint-disable no-process-exit */

const doWhile = require('dank-do-while');
const pigpiod = require('@/pigpiod');

const signal  = require('./signal');
const status  = require('./status');
const sun     = require('./sun');
const {logDebug, logInfo, logError} = require('./troubleshooting');



// *************************************************************************
// Globals
let mainLoopStatus = 'STARTUP';

// Connection to pigpiod
const globals = {};



const cleanup = function() {
  return new Promise(resolveCleanup => {
    logInfo('Quit process\n\n\n');

    mainLoopStatus = 'CANCEL';

    new Promise(resolveMainLoopStop => {
      let timeout;

      const interval = setInterval(() => {
        if(mainLoopStatus === 'STOPPED') {
          if(timeout) {
            clearTimeout(timeout);
          }

          return resolveMainLoopStop();
        }

        logDebug('Waiting for main loop to stop');
      }, 100);

      timeout = setTimeout(() => {
        if(interval) {
          clearInterval(interval);
        }

        logDebug('Terminating main loop after timeout');

        return resolveMainLoopStop();
      }, 2000);
    })
    .then(() => {
      if(globals.pi) {
        pigpiod.pigpio_stop(globals.pi);
        globals.pi = undefined;
      }

      status.update({process: 'stopped'}).then(resolveCleanup());
    });
  });
};

signal.installCleanupOnStop(cleanup);



// *************************************************************************
// main()

// sets up the pigpio library
globals.pi = pigpiod.pigpio_start();
if(globals.pi < 0) {
  logError('Failed to pigpio_start()');

  throw new Error('Failed to pigpio_start()');
}

const mainLoop = function(next) {
  // read sun data
  sun.getThreshold(globals.pi)
  .then(sunThreshold => {
    logDebug(`sunThreshold=${sunThreshold.threshold}`);

    if(['STARTUP', 'RUNNING'].includes(mainLoopStatus)) {
      setTimeout(() => next(true), 1000);
    } else {
      return next(false);
    }
  });
};

doWhile(next => {
  mainLoop(next);
}, () => {
  mainLoopStatus = 'STOPPED';
  logInfo('Terminated mainLoop');

  process.exit(0);
});
