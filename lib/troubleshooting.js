'use strict';

/* eslint-disable no-console */

const moment = require('moment');

const logOutput = function(level, string, object) {
  let output = `${moment().format('HH:mm:ss')} ${level} ${string}`;

  if(object) {
    output += JSON.stringify(object);
  }

  console.log(output);
}

const logDebug = function(string, object) {
  logOutput('DEBUG', string, object);
};

const logInfo = function(string, object) {
  logOutput('INFO ', string, object);
};

const logError = function(string, object) {
  logOutput('ERROR', string, object);
};



module.exports = {
  logDebug,
  logInfo,
  logError
};
