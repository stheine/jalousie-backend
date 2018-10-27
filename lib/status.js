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


const write = async function() {
  try {
    await fsExtra.writeJson('/var/jalousie/status.json', status, {spaces: 2});
  } catch(err) {
    // ignore
  }
};


const read = async function() {
  try {
    await fsExtra.access('/var/jalousie/status.json', fs.constants.R_OK);
    const oldStatus = await fsExtra.readJson('/var/jalousie/status.json');

    return oldStatus;
  } catch(err) {
    // ignore

    return {};
  }
};


module.exports = {
  dump,
  read,
  update,
  write
};
