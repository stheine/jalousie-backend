'use strict';

const fs           = require('fs');

// https://lodash.com/docs
const _            = require('lodash');
// https://www.npmjs.com/package/fs-extra
const fsExtra      = require('fs-extra');
// https://www.npmjs.com/package/es6-promisify
const es6Promisify = require('es6-promisify');
const access       = es6Promisify(fs.access);
const readJson     = es6Promisify(fsExtra.readJson);
const writeJson    = es6Promisify(fsExtra.writeJson);


let status = {};


const dump = function() {
  return status;
};


const update = function(changes) {
  status = _.merge(status, changes);
};


const write = function() {
  return writeJson('/var/jalousie/status.json', status);
};


const read = function() {
  return new Promise(resolve => {
    access('/var/jalousie/status.json', fs.constants.R_OK).then(() => {
      readJson('/var/jalousie/status.json').then(oldStatus => {
        return resolve(oldStatus);
      })
      .catch(() => {
        return resolve({});
      });
    })
    .catch(() => {
      return resolve({});
    });
  });
};


module.exports = {
  dump,
  read,
  update,
  write
};
