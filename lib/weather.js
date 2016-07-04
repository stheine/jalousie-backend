'use strict';

// https://www.npmjs.com/package/xpath
const xpath  = require('xpath');
const Dom    = require('xmldom').DOMParser;
// http://momentjs.com/docs
const moment = require('moment');

// https://github.com/stheine/ringbufferjs
const fs = require('fs');



const getNightTime = function() {
  return new Promise((resolve, reject) => {
    fs.readFile('/var/aerotec/wetter.xml', 'utf8', (err, content) => {
      if(err) {
        return reject(err);
      }

      const xmlDom = new Dom().parseFromString(content);
      // The times stored by Yahoo Weather are in this format: '9:29 pm'
      const sunriseRaw =
        xpath.select('//info//sunrise//text()', xmlDom).toString();
      const sunrise = moment(sunriseRaw, 'h:m a');
      const sunsetRaw =
        xpath.select('//info//sunset//text()', xmlDom).toString();
      const sunset = moment(sunsetRaw, 'h:m a');

      const weatherData = {
        sunrise: sunrise,
        sunset: sunset,
        weatherCode:
          xpath.select('//info//current_code//text()', xmlDom).toString()
      };

      return resolve(weatherData);
    });
  });
};



module.exports = {
  getNightTime
};
