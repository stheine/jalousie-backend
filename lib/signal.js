'use strict';

/* eslint-disable no-process-exit */

const {logDebug, logInfo} = require('./troubleshooting');



const handleCleanupAndExit = function(cleanup) {
  cleanup().then(() => {
    logInfo('Exit process after cleanup\n\n\n');

    // Stop the node process listen on stdin.
    // Otherwise the process would not properly end.
    if(process.stdin.isTTY) {
      process.stdin.end();
    }

    // Exit
    process.exit();
  });
};



const installCleanupOnStop = function(cleanup) {
  // Make the node process listen on stdin.
  // This is required to make CTRL-C trigger a SIGINT that can be handled.
  if(process.stdin.isTTY) {
    process.stdin.resume();
  } else {
    // Started as daemon, no stdin
    logInfo('No stdin listener');
  }

  process.on('SIGINT', () => {
    logDebug('Caught SIGINT');

    handleCleanupAndExit(cleanup);
  });

  process.on('SIGTERM', () => {
    logDebug('Caught SIGTERM');

    handleCleanupAndExit(cleanup);
  });

  logDebug('Signal handler installed');
};



module.exports = {
  installCleanupOnStop
};
