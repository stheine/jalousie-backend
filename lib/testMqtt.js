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
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/stat/status8 --message off


//  await client.publish('jalousie/2/3', 'it works');

  // https://github.com/arendst/Sonoff-Tasmota/wiki/sonoff-pow-r2#telemetry
//  await client.subscribe('tasmota/solar/stat/#');
  await client.subscribe('tasmota/solar/stat/POWER');   // Button oder per tasmota/solar/cmnd/power ' '
  await client.subscribe('tasmota/solar/stat/STATUS8'); // Angefordert per tasmota/solar/cmnd/STATUS '8'
//  await client.subscribe('tasmota/solar/tele/#');
  await client.subscribe('tasmota/solar/tele/SENSOR');  // Automatisch, 5min interval

  // #########################################################################
  // General MQTT commands, tasmota:
  // https://github.com/arendst/Sonoff-Tasmota/wiki/Commands
  //
  // #########################################################################
  // Power state:
  //
  // off:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/cmnd/power --message off
  // on:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/cmnd/power --message on
  // toggle:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/cmnd/power --message toggle
  //
  // Power abfrage:
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/cmnd/power --message ' '
  //
  // topic: 'tasmota/solar/stat/RESULT',
  // message: '{
  //   "POWER":"ON"
  // }'
  //
  // topic: 'tasmota/solar/stat/POWER',
  // message: 'ON'
  //
  // #########################################################################
  // System state (automatisch alle 5 minuten):
  //
  // topic: 'tasmota/solar/tele/STATE',
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
  // node_modules/.bin/mqtt publish --hostname 192.168.6.7 --topic tasmota/solar/cmnd/STATUS --message 8
  //
  // topic: 'tasmota/solar/tele/SENSOR',
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

//  await client.unsubscribe('tasmota');

//  await client.end();

//  console.log('done');
})();
