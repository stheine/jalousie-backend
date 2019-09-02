'use strict';

/* eslint-disable no-param-reassign */ // TODO object instead
/* eslint-disable unicorn/no-process-exit */

const pigpio = require('pigpio');

const status = require('./status');

const cleanup = async function(params) {
  params.log.info('Quit process');

  params.mainLoopStatus = 'CANCEL';

  await new Promise(resolveMainLoopStop => {
    let timeout;

    const interval = setInterval(() => {
      if(params.mainLoopStatus === 'STOPPED') {
        if(timeout) {
          clearTimeout(timeout);
        }

        return resolveMainLoopStop();
      }

      params.log.debug('Waiting for main loop to stop');
    }, 100);

    timeout = setTimeout(() => {
      if(interval) {
        clearInterval(interval);
      }

      params.log.debug('Terminating main loop after timeout');

      return resolveMainLoopStop();
    }, 2000);
  });

  status.update({process: 'stopped'});
  await status.write();

  pigpio.terminate();
};

const handleCleanupAndExit = async function(params) {
  await cleanup(params);

  params.log.info('Exit process after cleanup\n\n\n');

  // Stop the node process listen on stdin.
  // Otherwise the process would not properly end.
  if(process.stdin.isTTY) {
    process.stdin.end();
  }

  // Exit
  process.exit();
};

const installCleanupOnStop = function(params) {
  // Make the node process listen on stdin.
  // This is required to make CTRL-C trigger a SIGINT that can be handled.
  if(process.stdin.isTTY) {
    process.stdin.resume();
  } else {
    // Started as daemon, no stdin
    params.log.info('No stdin listener');
  }

  process.on('SIGINT', () => {
    params.log.debug('Caught SIGINT');

    handleCleanupAndExit(params);
  });

  process.on('SIGTERM', () => {
    params.log.debug('Caught SIGTERM');

    handleCleanupAndExit(params);
  });

  params.log.debug('Signal handler installed');
};



module.exports = {
  installCleanupOnStop,
  cleanup,
};
