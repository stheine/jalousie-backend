'use strict';

const pigpioDht = require('pigpio-dht');

const DHT_PIN  = 18;
const DHT_TYPE = 22;

module.exports = async function dht22() {
  return await new Promise((resolve, reject) => {
    const sensor = pigpioDht(DHT_PIN, DHT_TYPE);

    sensor.on('result', resolve);

    sensor.on('badChecksum', reject);

    sensor.read();

    setTimeout(() => {
      reject(new Error('Timeout'));
    }, 3000);
  });
};
