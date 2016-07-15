'use strict';

const fs = require('fs');
const _  = require('lodash');



class Status {
  constructor() {
    this.status = {};
  }

  write() {
    // write to disk
    fs.writeFile('status.json', JSON.stringify(this.status));
  }

  update(changes) {
    this.status = _.merge(this.status, changes);

    this.write();
  }
}



module.exports = Status;
