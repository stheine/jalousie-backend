'use strict';

/* eslint-disable no-console */

const moment = require('moment');

const logTimestamp = function() {
  return moment().format('HH:mm:ss');
};

const logDebug = function(string, object) {
  console.log(`${logTimestamp()} ${string} ${JSON.stringify(object || '')}`);
};

const logInfo = function(string, object) {
  console.log(`${logTimestamp()} ${string} ${JSON.stringify(object || '')}`);
};

const logError = function(string, object) {
  console.log(`${logTimestamp()} ${string} ${JSON.stringify(object || '')}`);
};



module.exports = {
  logDebug,
  logInfo,
  logError
};
