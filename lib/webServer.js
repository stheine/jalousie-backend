#!/usr/bin/env node
'use strict';

const fs         = require('fs');
const https      = require('https');
const path       = require('path');

// https://www.npmjs.com/package/express
const express    = require('express');
// passport / authentication
const passport   = require('passport');
const Strategy   = require('passport-http').DigestStrategy;
// https://www.npmjs.com/package/node-session
const NodeSession = require('node-session');
// https://www.npmjs.com/package/stack-trace
const stackTrace = require('stack-trace');
// https://www.npmjs.com/package/find-root
const findRoot   = require('find-root');
// https://lodash.com/docs
const _          = require('lodash');

const action     = require('./action');
const configFile = require('./configFile');
const status     = require('./status');



const readPackageJson = function(filename) {
  try {
    /* eslint-disable global-require */
    const packageJson = require(path.join(filename, 'package.json'));
    /* eslint-enable global-require */

    return {
      name:    packageJson.name,
      version: packageJson.version
    };
  } catch(err) {
    return {
      name:    filename,
      version: 'node'
    };
  }
};


const startup = function(globals) {
  // Configure authentication
  passport.use(new Strategy({qop: 'auth'}, (username, cb) => {
    if(username === globals.config.authentication.username) {
      return cb(null, username, globals.config.authentication.password);
    }

    return cb(null, false);
  }));

  // Start up web server
  const app = express();

  // human readable output for res.json()
  app.set('json spaces', '  ');

  // Enable session handling
  const nodeSession = new NodeSession({
    cookie:        'node_session',
    path:          '/',
    secret:        globals.config.authentication.sessionSecret,
    lifetime:      7 * 24 * 60 * 60 * 1000, // 7 days
    expireOnClose: false,
    driver:        'file',
    files:         path.join(__dirname, 'sessions')
  });
  app.use((req, res, next) => {
    nodeSession.startSession(req, res, next);
  });

  // Authentication middleware
  app.use((req, res, next) => {
    if(req.session.get('user')) {
      // Authentication ok
//    globals.log.debug(
//      `already authenticated: ${req.session.get('user')} for ${req.path}`);

      return next();
    } else if(req.path === '/about' ||
              req.path === '/login' ||
              req.path === '/logout' ||
              req.path === '/status' ||
              /favicon.ico$/.test(req.path)
    ) {
      // These URIs handle the authentication and may be called without
      // being already properly authenticated.
//      globals.log.debug(`no authentication needed for ${req.path}`);

      return next();
    }

    // Not authenticated. Need to redirect the user to the authentication.
    globals.log.info(
      `Not authenticated. Redirecting to => /login?url=${req.path}`);
    res.redirect(`/login?url=${encodeURIComponent(req.path)}`);
  });

  // Authentication login
  app.get('/login', passport.authenticate('digest', {session: false}),
    (req, res) => {
      // Authentication successful. Set user into session
      req.session.set('user', req.user);
//      globals.log.info(`Successfully authenticated: ` +
//        `${req.session.get('user')} for ${req.path}`);

      if(req.query.url) {
        // Redirect to the source URL
        const url = decodeURIComponent(req.query.url);

//        globals.log.info(`Redirecting to original url ${url}`);
        res.redirect(url);
      } else {
        res.send(`You are now logged in: ${req.session.get('user')}`);
      }
    });

  app.get('/logout', (req, res) => {
    if(req.session.get('user')) {
//      globals.log.info(`Logging out: ${req.session.get('user')}`);
      res.send('You are now logged out (<a href=login>login</a>)');
    } else {
//      globals.log.info('Already logged out');
      res.send('You are already logged out (<a href=login>login</a>)');
    }
    req.session.flush();
    req.session.regenerate();
  });

  // About
  app.get('/about', (req, res) => {
    let output = '<pre>';

    if(req.session.get('user')) {
      output += `Authenticated as ${req.session.get('user')}\n`;
    } else {
      output += `Not authenticated\n`;
    }

    output += '\n';
    output += stackTrace.get().map((currentStack, index) => {
      const currentFile       = currentStack.getFileName();
      let   currentModuleInfo;

      try {
        const currentRoot       = findRoot(currentFile) || currentFile;
        const currentPackage    = readPackageJson(currentRoot);

        currentModuleInfo =
          `${currentPackage.name}#${currentPackage.version}`;
      } catch(err) {
        currentModuleInfo = '';
      }

      return `[${index}] ` +
        `${currentModuleInfo} ` +
        `${path.basename(currentFile)}:${currentStack.getLineNumber()}` +
        `${(' ' + (currentStack.getMethodName() || '') + ' ' +
          (currentStack.getFunctionName() || '')  + ' ').replace(/ +/, ' ')}`;
    })
    .join('\n');

    output += '</pre>';

    res.send(output);
  });

  // Route for static files
  app.use(express.static(path.join(__dirname, '..', 'static')));

  // All other routes
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

  /* eslint-disable no-sync */
  https.createServer({
    key:  fs.readFileSync('/etc/letsencrypt/live/heine7.de/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/heine7.de/cert.pem')
  }, app).listen(globals.config.webServerPort);
  /* eslint-enable no-sync */

  globals.log.info(`Web server running on ` +
    `http://localhost:${globals.config.webServerPort}`);
};



module.exports = {
  startup
};
