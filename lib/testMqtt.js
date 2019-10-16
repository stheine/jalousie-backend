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


  // Stats abfrage:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic stat/PowSolar/status8 --message off


//  await client.publish('jalousie/2/3', 'it works');

  // https://github.com/arendst/Sonoff-Tasmota/wiki/sonoff-pow-r2#telemetry
//  await client.subscribe('stat/PowSolar/#');
  await client.subscribe('stat/PowSolar/POWER');   // Button oder per cmnd/PowSolar/power ' '
  await client.subscribe('stat/PowSolar/STATUS8'); // Angefordert per cmnd/PowSolar/STATUS '8'
//  await client.subscribe('tele/PowSolar/#');
  await client.subscribe('tele/PowSolar/SENSOR');  // Automatisch, 5min interval

  // #########################################################################
  // General MQTT commands, tasmota:
  // https://github.com/arendst/Sonoff-Tasmota/wiki/Commands
  //
  // #########################################################################
  // Power state:
  //
  // off:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic cmnd/PowSolar/power --message off
  // on:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic cmnd/PowSolar/power --message on
  // toggle:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic cmnd/PowSolar/power --message toggle
  //
  // Power abfrage:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic cmnd/PowSolar/power --message ' '
  //
  // topic: 'stat/PowSolar/RESULT',
  // message: '{
  //   "POWER":"ON"
  // }'
  //
  // topic: 'stat/PowSolar/POWER',
  // message: 'ON'
  //
  // #########################################################################
  // System state (automatisch alle 5 minuten):
  //
  // topic: 'tele/PowSolar/STATE',
  // message: '{
  //   "Time":"2019-10-13T19:53:55",
  //   "Uptime":"0T00:20:21",
  //   "Heap":14,
  //   "SleepMode":"Dynamic",
  //   "Sleep":50,
  //   "LoadAvg":27,
  //   "POWER":"OFF",
  //   "Wifi":{"AP":1,"SSId":"holzhaus","BSSId":"C8:0E:14:AD:92:DA","Channel":6,"RSSI":70,"LinkCount":1,"Downtime":"0T00:00:07"}
  // }'
  //
  // #########################################################################
  // Sensor state (automatisch alle 5 minuten, und bei Last-aenderung):
  // Abzufragen per:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic cmnd/PowSolar/STATUS --message 8
  //
  // topic: 'tele/PowSolar/SENSOR',
  // message: '{"Time":"2019-10-13T19:53:55",
  //   "ENERGY":{
  //     "TotalStartTime":"2019-10-08T16:24:23",
  //     "Total":0.008,
  //     "Yesterday":0.000,
  //     "Today":0.000,
  //     "Period":0,
  //     "Power":0,
  //     "ApparentPower":0,
  //     "ReactivePower":0,
  //     "Factor":0.00,
  //     "Voltage":0,
  //     "Current":0.000
  //   }
  // }'

  setInterval(() => {
    //
  }, 1000);

//  await client.unsubscribe('sonoff');

//  await client.end();

//  console.log('done');
})();
