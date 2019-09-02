'use strict';

const _       = require('lodash');
const execa   = require('execa');

const rrdFile = '/var/jalousie/jalousie.rrd';

// TODO tool to create rrd db (see /var/aerotec/rrdCreate.sh )

module.exports = {
  async update(rrdUpdates) {
    const {stderr} = await execa('/opt/rrdtool/bin/rrdupdate', [
      rrdFile,
      '--template',
      _.keys(rrdUpdates).join(':'),
      `N:${_.values(rrdUpdates).join(':')}`,
    ]);

    if(stderr) {
      throw new Error(stderr);
    }
  },
};
