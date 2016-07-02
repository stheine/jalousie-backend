'use strict';

const {logDebug, logInfo} = require('./troubleshooting'); // TODO



const handleCleanupAndExit = function(cleanup) {
  cleanup();

  logInfo('Exit process after cleanup');

  // Stop the node process listen on stdin.
  // Otherwise the process would not properly end.
  process.stdin.end();

  // Exit
  process.exit();
}



const installCleanupOnStop = function(cleanup) {
  // Make the node process listen on stdin.
  // This is required to make CTRL-C trigger a SIGINT that can be handled.
  process.stdin.resume();

  process.on('SIGINT', () => {
    logDebug("Caught SIGINT");

    handleCleanupAndExit(cleanup);
  });

  process.on('SIGTERM', () => {
    console.log("Caught SIGTERM");

    handleCleanupAndExit(cleanup);
  });

  logDebug('Signal handler installed');
};



module.exports = {
  installCleanupOnStop
};
