'use strict';

/* eslint-disable arrow-body-style */

const fs      = require('fs');

const _       = require('lodash');
const fsExtra = require('fs-extra');

const logger  = require('./logger');

let status = {};

const dump = function() {
  return status;
};

const update = function(changes) {
  status = _.merge(status, changes);
};

const write = async function() {
  try {
    await fsExtra.writeJson('/var/jalousie/status.json.tmp', status, {spaces: 2});
    await fsExtra.move('/var/jalousie/status.json.tmp', '/var/jalousie/status.json', {overwrite: true});
  } catch(err) {
    logger.error('Failed to write status', err.message);
  }
};

const read = async function() {
  try {
    await fsExtra.access('/var/jalousie/status.json', fs.constants.R_OK);
    const oldStatus = await fsExtra.readJson('/var/jalousie/status.json');

    return oldStatus;
  } catch(err) {
    logger.error('Failed to read status', err.message);

    // ignore
    return {};
  }
};

module.exports = {
  dump,
  read,
  update,
  write,
};
