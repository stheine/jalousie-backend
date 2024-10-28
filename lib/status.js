import fs       from 'node:fs';

import _        from 'lodash';
import fsExtra  from 'fs-extra';
import {logger} from '@stheine/helpers';

let status = {};

export default {
  dump() {
    return status;
  },

  update(changes) {
    status = _.merge(status, changes);
  },

  async publish(mqttClient) {
    try {
      await mqttClient.publishAsync('JalousieBackend/tele/STATUS', JSON.stringify(status), {retain: true});
    } catch(err) {
      logger.error('Failed to publish status', err.message);
    }
  },

  async write() {
    try {
      await fsExtra.writeJson('/var/jalousie/status.json.tmp', status, {spaces: 2});
      await fsExtra.move('/var/jalousie/status.json.tmp', '/var/jalousie/status.json', {overwrite: true});
    } catch(err) {
      logger.error('Failed to write status', err.message);
    }
  },

  async read() {
    try {
      await fsExtra.access('/var/jalousie/status.json', fs.constants.R_OK);
      const oldStatus = await fsExtra.readJson('/var/jalousie/status.json');

      return oldStatus;
    } catch(err) {
      logger.error('Failed to read status', err.message);

      // ignore
      return {};
    }
  },
};
