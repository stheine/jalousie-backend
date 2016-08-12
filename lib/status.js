'use strict';

const fs         = require('fs');
const _          = require('lodash');



let status = {};

const write = function() {
  // write to disk
  return new Promise((resolve, reject) => {
    fs.writeFile('/var/jalousie/status.json',
      JSON.stringify(status, null, '  '),
      err => {
        if(err) {
          return reject(err);
        }

        return resolve();
      });
  });
};

const update = function(changes) {
  status = _.merge(status, changes);

  return write();
};



module.exports = update;
