'use strict';

/* eslint-disable arrow-body-style */

const fs      = require('fs');

const _       = require('lodash');
const fsExtra = require('fs-extra');


let status = {};


const dump = function() {
  return status;
};


const update = function(changes) {
  status = _.merge(status, changes);
};


const write = function() {
  return fsExtra.writeJson('/var/jalousie/status.json', status);
};


const read = function() {
  return new Promise(resolve => {
    fsExtra.access('/var/jalousie/status.json', fs.constants.R_OK).then(() => {
      fsExtra.readJson('/var/jalousie/status.json').then(oldStatus => {
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
