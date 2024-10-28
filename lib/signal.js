import check    from 'check-types-2';
import {logger} from '@stheine/helpers';

import status   from './status.js';

const cleanup = async function({mqttClient}) {
  logger.info('Quit process');

  status.update({process: 'stopped'});
  await status.write();

  await mqttClient.endAsync();
};

const handleCleanupAndExit = async function({mainLoopInterval, mqttClient}) {
  clearInterval(mainLoopInterval);

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

export default {
  installCleanupOnStop({mainLoopInterval, mqttClient}) {
    check.assert.object(mainLoopInterval, 'mainLoopInterval missing');
    check.assert.object(mqttClient, 'mqttClient missing');

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

      handleCleanupAndExit({mainLoopInterval, mqttClient});
    });

    process.on('SIGTERM', () => {
      logger.debug('Caught SIGTERM');

      handleCleanupAndExit({mainLoopInterval, mqttClient});
    });

    // logger.debug('Signal handler installed');
  },
};
