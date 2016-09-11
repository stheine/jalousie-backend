#!/usr/bin/env node
'use strict';

const fs         = require('fs');
const https      = require('https');

// https://www.npmjs.com/package/express
const express    = require('express');
const passport   = require('passport');
const Strategy   = require('passport-http').DigestStrategy;

const action     = require('./action');
const configFile = require('./configFile');
const status     = require('./status');



const startup = function(globals) {
  // Configure authentication
  passport.use(new Strategy({qop: 'auth'}, (username, cb) => {
    if(username === globals.config.authentication.username) {
      return(cb(null, username, globals.config.authentication.password));
    } else {
      return cb(null, false);
    }
  }));

  // Start up web server
  const app = express();

  app.set('json spaces', '  '); // human readable output for res.json()

  app.get('/login', passport.authenticate('digest', {session: false}),
    (req, res) => {
      res.json(req.user);
    });

  app.use(express.static('../static'));

  app.get('/status', (req, res) => {
//    globals.log.info('Status');
    res.json(status.dump());
  });

  app.get('/dumpConfig', (req, res) => {
    globals.log.info('Dump configuration');
    res.json(globals.config);
  });

  app.get('/readConfig', (req, res) => {
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

  app.get('/stop', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /stop');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_STOP');
      action.start(globals, 'JALOUSIE_STOP');
      res.send('ok');
    }
  });

  app.get('/fullUp', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullUp');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_FULL_UP');
      action.start(globals, 'JALOUSIE_FULL_UP');
      res.send('ok');
    }
  });

  app.get('/fullDown', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullDown');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_FULL_DOWN');
      action.start(globals, 'JALOUSIE_FULL_DOWN');
      res.send('ok');
    }
  });

  app.get('/shadow', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /shadow');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SHADOW');
      action.start(globals, 'JALOUSIE_SHADOW');
      res.send('ok');
    }
  });

  app.get('/turn', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /turn');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_TURN');
      action.start(globals, 'JALOUSIE_TURN');
      res.send('ok');
    }
  });

  app.get('/allUp', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allUp');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALL_UP');
      action.start(globals, 'JALOUSIE_ALL_UP');
      res.send('ok');
    }
  });

  app.get('/allDown', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allDown');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALL_DOWN');
      action.start(globals, 'JALOUSIE_ALL_DOWN');
      res.send('ok');
    }
  });

  app.get('/individual', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /individual');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_INDIVIDUAL');
      action.start(globals, 'JALOUSIE_INDIVIDUAL');
      res.send('ok');
    }
  });

  app.get('/specialTest', (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /specialTest');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SPECIAL_TEST');
      action.start(globals, 'JALOUSIE_SPECIAL_TEST');
      res.send('ok');
    }
  });

// https
  https.createServer({
    key:  fs.readFileSync('/etc/letsencrypt/live/heine7.de/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/heine7.de/cert.pem')
  }, app).listen(globals.config.webServerPort);

// http  app.listen(globals.config.webServerPort);

  globals.log.info(`Web server running on ` +
    `http://localhost:${globals.config.webServerPort}`);
};



module.exports = {
  startup
};
