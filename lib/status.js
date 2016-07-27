'use strict';

const fs         = require('fs');
const _          = require('lodash');

const {logError} = require('./troubleshooting');



class Status {
  constructor() {
    this.status = {};
  }

  write() {
    // write to disk
    return new Promise((resolve, reject) => {
      fs.writeFile('/var/jalousie/status.json',
        JSON.stringify(this.status, null, '  '),
        err => {
          if(err) {
            return reject(err);
          }

          return resolve();
        });
    });
  }

  update(changes) {
    this.status = _.merge(this.status, changes);

    return this.write();
  }
}



module.exports = Status;
