import fsExtra from 'fs-extra';

const configFile = '/var/jalousie/config.json';

export default {
  async read() {
    const config = await fsExtra.readJson(configFile);

    return config;
  },

  async write(config) {
    await fsExtra.writeJson(configFile, config);
  },
};
