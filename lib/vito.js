'use strict';

const fs = require('fs');
// http://momentjs.com/docs
const moment = require('moment');



const getTemperature = function() {
  return new Promise((resolve, reject) => {
    fs.readFile('/var/vito/_tempAussen.dat', (err, content) => {
      if(err) {
        return reject(err);
      }

      return resolve({
        temperatureOutside: parseInt(content, 10),
        timestamp:          moment()
      });
    });
  });
};



module.exports = {
  getTemperature
};
