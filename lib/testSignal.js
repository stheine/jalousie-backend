'use strict';

const signal    = require('./signal');
const {logInfo} = require('./troubleshooting'); // TODO



// *********************************************************************************
// main()

const cleanup = function() {
  console.log('cleanup before exit');
};

signal.installCleanupOnStop(cleanup);

setTimeout(() => {
  // don't do anything

  cleanup();
  process.exit();
}, 5000);
