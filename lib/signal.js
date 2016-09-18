'use strict';

/* eslint-disable no-process-exit */

const pigpiod = require('@stheine/pigpiod');
const status  = require('./status');



const cleanup = function(globals) {
  return new Promise((resolveCleanup, rejectCleanup) => {
    globals.log.info('Quit process');

    globals.mainLoopStatus = 'CANCEL';

    new Promise(resolveMainLoopStop => {
      let timeout;

      const interval = setInterval(() => {
        if(globals.mainLoopStatus === 'STOPPED') {
          if(timeout) {
            clearTimeout(timeout);
          }

          return resolveMainLoopStop();
        }

        globals.log.debug('Waiting for main loop to stop');
      }, 100);

      timeout = setTimeout(() => {
        if(interval) {
          clearInterval(interval);
        }

        globals.log.debug('Terminating main loop after timeout');

        return resolveMainLoopStop();
      }, 2000);
    })
    .then(() => {
      if(globals.spi) {
        pigpiod.spi_close(globals.pi, globals.spi);
        globals.spi = undefined;
      }

      if(globals.pi) {
        pigpiod.pigpio_stop(globals.pi);
        globals.pi = undefined;
      }

      status.update({process: 'stopped'});
      status.write().then(resolveCleanup)
      .catch(rejectCleanup);
    });
  });
};


const handleCleanupAndExit = function(globals) {
  cleanup(globals).then(() => {
    globals.log.info('Exit process after cleanup\n\n\n');

    // Stop the node process listen on stdin.
    // Otherwise the process would not properly end.
    if(process.stdin.isTTY) {
      process.stdin.end();
    }

    // Exit
    process.exit();
  });
};



const installCleanupOnStop = function(globals) {
  // Make the node process listen on stdin.
  // This is required to make CTRL-C trigger a SIGINT that can be handled.
  if(process.stdin.isTTY) {
    process.stdin.resume();
  } else {
    // Started as daemon, no stdin
    globals.log.info('No stdin listener');
  }

  process.on('SIGINT', () => {
    globals.log.debug('Caught SIGINT');

    handleCleanupAndExit(globals);
  });

  process.on('SIGTERM', () => {
    globals.log.debug('Caught SIGTERM');

    handleCleanupAndExit(globals);
  });

  globals.log.debug('Signal handler installed');
};



module.exports = {
  installCleanupOnStop,
  cleanup
};
