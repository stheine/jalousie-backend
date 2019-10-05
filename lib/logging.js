// Logging using winston

'use strict';

/* eslint-disable no-sync */

const fs            = require('fs');
const path          = require('path');

const moment        = require('moment');
const stackTrace    = require('stack-trace');
const winston       = require('winston');

require('winston-daily-rotate-file');

const lineFromStackTrace = function(stackLevel) {
  let sourceFileName;
  let sourceLineNumber;
//  let sourceFunction;

  if(stackLevel && stackLevel.getFileName) {
    sourceFileName    = path.basename(stackLevel.getFileName() || '');
    sourceLineNumber  = stackLevel.getLineNumber();
//    sourceFunction    = stackLevel.getFunctionName();
  }

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

const formatLogMessage = winston.format.printf(({level, message, timestamp}) => {
  const result =
    `${timestamp} ` +
    `${level.toUpperCase()} ` +
    `${message}`;

  return result;
});

const logging = function(globals) {
  const logDir      = globals.config.logging.logDir;
  const logBasename = path.basename(process.argv[1]).replace(/\.js$/, '.log');
  const logFilename = path.join(logDir, logBasename);
  let   logDirStats;

  const logger = winston.createLogger({
    exitOnError: false,
    format: winston.format.combine(
      winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
      formatLogMessage,
    ),
    transports: [new winston.transports.Console({level:  'debug'})],
  });

  try {
    logDirStats = fs.statSync(logDir);
  } catch(err) {
    try {
      fs.mkdirSync(logDir, 0o775);
      logDirStats = fs.statSync(logDir);
    } catch(errMkdir) {
      logger.error(`${logPrefixText()}${handleDataType(errMkdir)}`);
    }
  }

  if(logDirStats && logDirStats.isDirectory()) {
    logger.add(new winston.transports.DailyRotateFile({
      level:       'debug',
      filename:    logFilename,
      datePattern: 'ddd',
    }));
  } else {
    logger.error(`${logPrefixText()}${handleDataType(new Error(`Not a valid directory for logging() '${logDir}'`))}`);
  }

  return {
    debug(message, meta) {
      logger.debug(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    info(message, meta) {
      logger.info(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    warn(message, meta) {
      logger.warn(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    error(message, meta) {
      logger.error(`${logPrefixText()}${handleDataType(message)} ` +
        `${handleDataType(meta)}`);
    },
    cleanLogTomorrow() {
      const tomorrowDay = moment().add(1, 'days').format('ddd');

      try {
        fs.unlinkSync(`${logFilename}${tomorrowDay}`);
      } catch(err) {
        if(err.code !== 'ENOENT') {
          logger.error(`${logPrefixText()}${handleDataType(err)}`);
        }
      }
    },
  };
};

module.exports = logging;
