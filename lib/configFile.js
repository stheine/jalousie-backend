'use strict';

const fs = require('fs');

const configFile = '/var/jalousie/config.json';



const read = function() {
  return new Promise((resolve, reject) => {
    fs.readFile(configFile, (errRead, data) => {
      if(errRead) {
        return reject(errRead);
      }

      let config;

      try {
        config = JSON.parse(data);
      } catch(errJSON) {
        return reject(errJSON);
      }

      return resolve(config);
    });
  });
};


const write = function(config) {
  return new Promise((resolve, reject) => {
    fs.writeFile(configFile, JSON.stringify(config, null, 2), errWrite => {
      if(errWrite) {
        return reject(errWrite);
      }

      return resolve();
    });
  });
};


module.exports = {
  read,
  write
};
