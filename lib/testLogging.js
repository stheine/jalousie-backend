#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');

configFile.read().then(config => {
  if(!config) {
    throw new Error('Failed to read configuration.');
  }

  const globals = {config};

  const log = logging(globals);

  log.debug('debug');
  log.info('info');
  log.warn('warn');
  log.error('error');
  log.error('error mit daten', {level: 'fatal', message: 'very bad'});
  log.error(new Error('das ist ein Error'));
  log.error('hier kommt ein Error', new Error('das ist ein Error'));
  log.error({blah: 'blubb', tra: 'tralla'});
});
