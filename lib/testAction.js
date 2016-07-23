#!/usr/bin/env node
'use strict';

const Action = require('./Action');

const {logDebug, logInfo, logError} = require('./troubleshooting');



let actionThread;

const startAction = function(action, lastActionThread) {
  return new Action(action, lastActionThread, {
    config: {},
    gpio: {
      down: -1,
      up:    1
    },
    pi: 0
  });
};



actionThread = startAction('JALOUSIE_AUS', actionThread);
actionThread = startAction('JALOUSIE_GANZHOCH', actionThread);
setTimeout(() => {
  actionThread = startAction('JALOUSIE_GANZRUNTER', actionThread);
  setTimeout(() => {
    actionThread = startAction('JALOUSIE_STOP', actionThread);
  }, 2500);
}, 4000);
