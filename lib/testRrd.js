#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const rrdtool = require('./rrdtool');

(async() => {
  try {
    const result = await rrdtool.update({flagSun: 0});

    console.log(result);
  } catch(err) {
    console.log(err);
  }
})();
