#!/usr/bin/env node

'use strict';

/* eslint-disable no-process-exit */

const signal    = require('./signal');
const {logInfo} = require('./troubleshooting');



const cleanup = function() {
  logInfo('cleanup before exit');
};

signal.installCleanupOnStop(cleanup);

setTimeout(() => {
  // don't do anything

  cleanup();
  process.exit();
}, 5000);
