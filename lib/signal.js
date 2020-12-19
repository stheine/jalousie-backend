'use strict';

const check  = require('check-types-2');

const logger = require('./logger');
const status = require('./status');

const cleanup = async function({mqttClient}) {
  logger.info('Quit process');

  status.update({process: 'stopped'});
  await status.write();

  mqttClient.end();
};

const handleCleanupAndExit = async function({mainLoopInterval, mqttClient, weatherInterval}) {
  clearInterval(mainLoopInterval);
  clearInterval(weatherInterval);

  await cleanup({mqttClient});

  logger.info('Exit process after cleanup\n\n\n');

  // Stop the node process listen on stdin.
  // Otherwise the process would not properly end.
  if(process.stdin.isTTY) {
    process.stdin.end();
  }

  // Exit
  process.exit();
};

const installCleanupOnStop = function({mainLoopInterval, mqttClient, weatherInterval}) {
  check.assert.object(mainLoopInterval, 'mainLoopInterval missing');
  check.assert.object(mqttClient, 'mqttClient missing');
  check.assert.object(weatherInterval, 'weatherInterval missing');

  // Make the node process listen on stdin.
  // This is required to make CTRL-C trigger a SIGINT that can be handled.
  if(process.stdin.isTTY) {
    process.stdin.resume();
  } else {
    // Started as daemon, no stdin
    logger.info('No stdin listener');
  }

  process.on('SIGINT', () => {
    logger.debug('Caught SIGINT');

    handleCleanupAndExit({mainLoopInterval, mqttClient, weatherInterval});
  });

  process.on('SIGTERM', () => {
    logger.debug('Caught SIGTERM');

    handleCleanupAndExit({mainLoopInterval, mqttClient, weatherInterval});
  });

  // logger.debug('Signal handler installed');
};



module.exports = {
  installCleanupOnStop,
  cleanup,
};
