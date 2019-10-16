#!/usr/bin/env node

'use strict';

/* eslint-disable max-len */
/* eslint-disable no-console */

const mqtt = require('async-mqtt');

(async() => {
  const client = await mqtt.connectAsync('tcp://192.168.6.7:1883');

  client.on('message', (topic, message) => {
    console.log({topic, message: message.toString()});
  });

  await client.publish('cmnd/PowSolar/Status', '8');
//  await client.publish('cmnd/PowSolar/TelePeriod', '60');

  await client.end();
})();
