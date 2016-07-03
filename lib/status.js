'use strict';

const fs = require('fs');
const _  = require('lodash');

const {logDebug, logInfo} = require('./troubleshooting'); // TODO module



const Status = function() {
  this._status = {};
};



Status.prototype.write = function() {
  // write to disk
  fs.writeFile('status.json', JSON.stringify(this._status));
};



Status.prototype.update = function(changes) {
  this._status = _.merge(this._status, changes);

  this.write();
};



module.exports = Status;
