#!/usr/bin/env node

'use strict';

const configFile = require('./configFile');
const logging    = require('./logging');

(async() => {
  const config = await configFile.read();
  const params = {config};

  const log = logging(params);

  log.debug('debug');
  log.info('info');
  log.warn('warn');
  log.error('error');
  log.error('error mit daten', {level: 'fatal', message: 'very bad'});
  log.error(new Error('das ist ein Error'));
  log.error('hier kommt ein Error', new Error('das ist ein Error'));
  log.error({blah: 'blubb', tra: 'tralla'});
})();
