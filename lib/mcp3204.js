'use strict';

// Reads the data of an MCP3204 A-D converter

const mcpSpiAdc = require('mcp-spi-adc');

const channel = 0;

module.exports = async function mcp3204() {
  return await new Promise((resolve, reject) => {
    const adc = mcpSpiAdc.openMcp3204(channel, errOpen => {
      if(errOpen) {
        return reject(errOpen);
      }

      adc.read((errRead, value) => {
        if(errRead) {
          return reject(errRead);
        }

        resolve(value);
      });
    });
  });
};
