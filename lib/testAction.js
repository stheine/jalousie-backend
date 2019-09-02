#!/usr/bin/env node

'use strict';

/* eslint-disable no-unused-vars */
const delay       = require('delay');
const millisecond = require('millisecond');
/* eslint-enable no-unused-vars */

const Action      = require('./Action');
const configFile  = require('./configFile');
const logging     = require('./logging');

(async() => {
  const config = await configFile.read();
  const params = {config};

  params.log = logging(params);

  const action = new Action(params);

  await delay(millisecond('10ms'));

//  await action.start('JALOUSIE_OFF');

  await action.start('JALOUSIE_FULL_UP');

//  await action.start('JALOUSIE_FULL_DOWN');

//  await action.start('JALOUSIE_DOWN_ON');
//  await delay(millisecond('1 second'));
//  await action.start('JALOUSIE_DOWN_OFF');

//  await action.start('JALOUSIE_UP_ON');
//  await delay(millisecond('1 second'));
//  await action.start('JALOUSIE_UP_OFF');

//  await action.start('JALOUSIE_STOP');
})();
