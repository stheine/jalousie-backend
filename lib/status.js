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


let flags  = {};
let status = {};

const updateFlags = function(changes) {
  flags = _.merge(flags, changes);

  return writeJson('/var/jalousie/flags.json', flags);
};

const update = function(changes) {
  status = _.merge(status, changes);

  return writeJson('/var/jalousie/status.json', status);
};

const readFlags = function() {
  return new Promise(resolve => {
    access('/var/jalousie/flags.json', fs.constants.R_OK).then(() => {
      readJson('/var/jalousie/flags.json').then(oldFlags => {
        return resolve(oldFlags);
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

const dumpFlags = function() {
  return flags;
};

const dumpStatus = function() {
  return status;
};

module.exports = {
  updateFlags,
  update,
  readFlags,
  dumpFlags,
  dumpStatus
};
