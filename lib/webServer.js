#!/usr/bin/env node
'use strict';

// https://www.npmjs.com/package/express
const express             = require('express');

const action              = require('./action');
const configFile          = require('./configFile');
const status              = require('./status');



const startup = function(globals) {
  // Start up web server
  const app = express();

  app.set('json spaces', '  '); // human readable output for res.json()

  app.get('/status', (req, res) => {
    globals.log.info('Status');
    res.json(status.dump());
  });

  app.get('/configRead', (req, res) => {
    // Read configuration from file
    globals.log.info('Read configuration');
    configFile.read().then(newConfig => {
      globals.config = newConfig;
      res.send('ok');
    })
    .catch(err => {
      globals.log.error(err);
      res.status(500).send(err);
    });
  });

  app.get('/ganzhoch', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /ganzhoch');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_GANZHOCH');
      // Start new thread.
      action.start('JALOUSIE_GANZHOCH', globals);
      res.send('ok');
    }
  });

  app.get('/ganzrunter', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /ganzrunter');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_GANZRUNTER');
      // Start new thread.
      action.start('JALOUSIE_GANZRUNTER', globals);
      res.send('ok');
    }
  });

  app.get('/hochclick', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /hochclick');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_HOCH, AN');
      // Hoch Click
      action.start('JALOUSIE_HOCH_AN', globals);
      res.send('ok');
    }
  });

  app.get('/hochrelease', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /hochrelease');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_HOCH, AUS');
      // Hoch Release
      action.start('JALOUSIE_HOCH_AUS', globals);
      res.send('ok');
    }
  });

  app.get('/runterclick', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /runterclick');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_RUNTER, AN');
      // Runter Click
      action.start('JALOUSIE_RUNTER_AN', globals);
      res.send('ok');
    }
  });

  app.get('/runterrelease', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /runterrelease');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_RUNTER, AUS');
      // Runter Release
      action.start('JALOUSIE_RUNTER_AUS', globals);
      res.send('ok');
    }
  });

  app.get('/stopclick', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /stopclick');
      res.send('windalarm');
    } else {
      globals.log.info('Stop: JALOUSIE_HOCH, AN, 140ms, AUS');
      action.start('JALOUSIE_STOP', globals);
      res.send('ok');
    }
  });

  app.get('/schattenclick', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /schattenclick');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SCHATTEN');
      // Start new thread.
      action.start('JALOUSIE_SCHATTEN', globals);
      res.send('ok');
    }
  });

  app.get('/wendungclick', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /wendungclick');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_WENDUNG');
      // Start new thread.
      action.start('JALOUSIE_WENDUNG', globals);
      res.send('ok');
    }
  });

  app.get('/allehoch', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /allehoch');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALLE_HOCH');
      // Start new thread.
      action.start('JALOUSIE_ALLE_HOCH', globals);
      res.send('ok');
    }
  });

  app.get('/allerunter', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /allerunter');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALLE_RUNTER');
      // Start new thread.
      action.start('JALOUSIE_ALLE_RUNTER', globals);
      res.send('ok');
    }
  });

  app.get('/individuell', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /individuell');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_INDIVIDUELL');
      // Start new thread.
      action.start('JALOUSIE_INDIVIDUELL', globals);
      res.send('ok');
    }
  });

  app.get('/sonder', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm unterdrueckt /sonder');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SONDER_TEST');
      // Start new thread.
      action.start('JALOUSIE_SONDER_TEST', globals);
      res.send('ok');
    }
  });

  app.listen(globals.config.webServerPort);

  globals.log.info(`Web server running on ` +
    `http://localhost:${globals.config.webServerPort}`);
};



module.exports = {
  startup
};
