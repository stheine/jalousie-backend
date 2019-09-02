'use strict';

const fsExtra = require('fs-extra');

const configFile = '/var/jalousie/config.json';

const read = async function() {
  const config = await fsExtra.readJson(configFile);

  return config;
};

const write = async function(config) {
  await fsExtra.writeJson(configFile, config);
};

module.exports = {
  read,
  write,
};
