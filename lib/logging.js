// Logging using winston
'use strict';

const fs            = require('fs');
const path          = require('path');
const moment        = require('moment');
const stackTrace    = require('stack-trace');
const winston       = require('winston');
const WinstonRotate = require('winston-daily-rotate-file');
// winston.emitErrs = true;



const lineFromStackTrace = function(stackLevel) {
  const sourceFileName    = path.basename(stackLevel.getFileName() || '');
  const sourceLineNumber  = stackLevel.getLineNumber();
//    const sourceFunction    = stackLevel.getFunctionName();

  const prefixText = `${sourceFileName}:${sourceLineNumber} `;

//    if(sourceFunction) {
//      prefixText += `${sourceFunction}() `;
//    }

  return prefixText;
};


const logPrefixText = function() {
  const callingStackLevel = stackTrace.get()[2];

  return lineFromStackTrace(callingStackLevel);
};


const convertErrorToString = function(error) {
  const plainObject = {};

  Reflect.ownKeys(error).forEach(errorObjectKey => {
    if(errorObjectKey === 'stack') {
      const throwingStackLevel = stackTrace.parse(error)[0];

      plainObject.errorLocation = lineFromStackTrace(throwingStackLevel);
    } else {
      plainObject[errorObjectKey] = error[errorObjectKey];
    }
  });

  return `ERROR: ${JSON.stringify(plainObject, null, '  ')}`;
};



const handleDataType = function(message) {
  switch(typeof message) {
    case 'object':
      if(message instanceof Error) {
        return convertErrorToString(message);
      }

      return JSON.stringify(message, null, '  ');

    case 'boolean':
    case 'number':
    case 'string':
      return message;

    case 'undefined':
      return '';

// TODO    "symbol"
// TODO    "function"
    default:
      throw new Error(`Unhandled log data type '${typeof message}'`);
  }
};



const formatLogMessage = function(logOptions) {
  let outputString = '';

  // Time stamp
  const logTimeFormat = 'YYYY-MM-DD HH:mm:ss';

//  if(logMilliseconds) {
//    logTimeFormat += '.SSS';
//  }
  outputString += `${moment().format(logTimeFormat)} `;

  // Process Id
//  if(logProcessId) {
//    outputString += `(${process.pid}) `;
//  }

  // Log level
  outputString +=  `${logOptions.level.toUpperCase()} `;

  // Log message
  if(logOptions.message !== undefined) {
    outputString += logOptions.message;
  }

  // Meta data
//  if(logOptions.meta && Object.keys(logOptions.meta).length) {
//    outputString += `\n  ${JSON.stringify(logOptions.meta)}`;
//  }

  return outputString;
};


const logging = function(globals) {
  const logDir      = globals.config.logging.logDir;
  const logBasename =
    path.basename(process.argv[1]).replace(/\.js$/, '.log.');
  const logFilename = path.join(logDir, logBasename);
  let   logDirStats;

  /* eslint-disable no-sync */
  try {
    logDirStats = fs.statSync(logDir);
  } catch(err) {
    try {
      fs.mkdirSync(logDir, 0o775);
      logDirStats = fs.statSync(logDir);
    } catch(errMkdir) {
      throw errMkdir;
    }
  }
  /* eslint-enable no-sync */

  if(!logDirStats || !logDirStats.isDirectory()) {
    throw new Error(`Not a valid directory for logging() '${logDir}'`);
  }

  const logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        level:            'debug',
        json:             false,
        colorize:         true,
        formatter:        formatLogMessage

      }),
      new WinstonRotate({
        level:            'debug',
        filename:         logFilename,
        datePattern:      'ddd',
        json:             false,
        formatter:        formatLogMessage
      })
    ],
    exitOnError: false
  });

  return {
    debug: (message, meta) => {
      logger.debug(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    info: (message, meta) => {
      logger.info(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    warn: (message, meta) => {
      logger.warn(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    error: (message, meta) => {
      logger.error(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    }
  };
};

module.exports = logging;
