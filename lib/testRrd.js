#!/usr/bin/env node
'use strict';

// https://www.npmjs.com/package/rrdtools
const rrdtool   = require('rrdtools');

const {logInfo, logError} = require('./troubleshooting');

const rrdFile = '/var/jalousie/jalousie.rrd';
const rrdNow  = rrdtool.nows();

rrdtool.create(rrdFile, 120, rrdNow, [
  'DS:windThreshold:GAUGE:300:U:U',
  'DS:sunThreshold:GAUGE:300:U:U',
  'DS:temperatureKty:GAUGE:300:U:U',
  'DS:temperatureDht:GAUGE:300:U:U',
  'DS:humidity:GAUGE:300:U:U',
  'DS:temperatureOutside:GAUGE:300:U:U',
  'DS:weatherCode:GAUGE:300:U:U',
  'DS:flagSun:GAUGE:300:U:U',
  'DS:flagWindalarm:GAUGE:300:U:U',
  'DS:flagNight:GAUGE:300:U:U',
  'RRA:MAX:0.5:1:86400'
], err => {
  if(err) {
    logError(err);
    throw err;
  }

  logInfo(`rrd file ${rrdFile} created`);

  rrdtool.info(rrdFile, rrdInfo => {
    logInfo(rrdInfo);
  });

  rrdtool.update(rrdFile, 'windThreshold:sunThreshold:temperatureKty:' +
    'temperatureDht:humidity:temperatureOutside:weatherCode:flagSun:' +
    'flagWindalarm:flagNight',
    [[rrdNow, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].join(':')],
    errUpdate => {
      if(errUpdate) {
        logError(errUpdate);
      }

      logInfo('ok');

      rrdtool.info(rrdFile, rrdInfo => {
        logInfo(rrdInfo);
      });
    });
});
