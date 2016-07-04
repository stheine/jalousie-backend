'use strict';

const fs = require('fs');
const _  = require('lodash');



const Status = function() {
  this.status = {};
};



Status.prototype.write = function() {
  // write to disk
  fs.writeFile('status.json', JSON.stringify(this.status));
};



Status.prototype.update = function(changes) {
  this.status = _.merge(this.status, changes);

  this.write();
};



module.exports = Status;
