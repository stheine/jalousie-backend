'use strict';

const {logDebug, logInfo, logError} = require('./troubleshooting'); // TODO

// https://github.com/stheine/ringbufferjs
const fs = require('fs');



const getTemperature = function() {
  return new Promise((resolve, reject) => {
    fs.readFile('/var/vito/_tempAussen.dat', (err, content) => {
      if(err) {
        return reject(err);
      }

      return resolve(parseInt(content));
    });
  });
};



module.exports = {
  getTemperature
};
