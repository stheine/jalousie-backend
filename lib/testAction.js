#!/usr/bin/env node

'use strict';

const Action = require('./Action');



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



actionThread = startAction('JALOUSIE_OFF', actionThread);
actionThread = startAction('JALOUSIE_FULL_UP', actionThread);
setTimeout(() => {
  actionThread = startAction('JALOUSIE_FULL_DOWN', actionThread);
  setTimeout(() => {
    actionThread = startAction('JALOUSIE_STOP', actionThread);
  }, 2500);
}, 4000);
