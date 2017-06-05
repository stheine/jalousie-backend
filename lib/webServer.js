#!/usr/bin/env node

'use strict';

const fs                   = require('fs');
const http                 = require('http');
const https                = require('https');
const path                 = require('path');

const findRoot             = require('find-root');
const stackTrace           = require('stack-trace');
const NodeSession          = require('node-session');
const express              = require('express');
const passportPort         = require('passport');
const passportProxy        = require('passport');
const DigestStrategy       = require('passport-http').DigestStrategy;
const ReverseProxyStrategy = require('passport-reverseproxy');
const fsExtra              = require('fs-extra');
const moment               = require('moment');

const action               = require('./action');
const configFile           = require('./configFile');
const status               = require('./status');



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
  passportPort.use(new DigestStrategy({qop: 'auth'}, (username, cb) => {
    if(username === globals.config.authentication.username) {
      return cb(null, username, globals.config.authentication.password);
    }

    return cb(null, false);
  }));
  passportProxy.use(new ReverseProxyStrategy({
    headers: {
      'X-Forwarded-User': {alias: 'username', required: true},
      'X-Forwarded-UserEmail': {alias: 'email', required: false}
    }
  }));

  // Start up web server
  const appPort  = express();
  const appProxy = express();

  // human readable output for res.json()
  appPort.set('json spaces', '  ');
  appProxy.set('json spaces', '  ');

  // Enable session handling
  // TODO express session????
  const nodeSession = new NodeSession({
    cookie:        'node_session',
    path:          '/',
    secret:        globals.config.authentication.sessionSecret,
    lifetime:      7 * 24 * 60 * 60 * 1000, // 7 days
    expireOnClose: false,
    driver:        'file',
    files:         path.join(__dirname, 'sessions')
  });

  appPort.use((req, res, next) => nodeSession.startSession(req, res, next));
  appProxy.use((req, res, next) => nodeSession.startSession(req, res, next));

  // Authentication middleware
  appPort.use((req, res, next) => {
    if(req.session.get('user')) {
      // Authentication ok
//    globals.log.debug(
//      `already authenticated: ${req.session.get('user')} for ${req.path}`);

      return next();
    } else if(/\/(about|login|logout|status)$/.test(req.path) ||
              /favicon.ico$/.test(req.path)
    ) {
      // These URIs handle the authentication and may be called without
      // being already properly authenticated.
//      globals.log.debug(`no authentication needed for ${req.path}`);

      return next();
    }

    // Not authenticated. Need to redirect the user to the authentication.
    globals.log.info(
      `Not authenticated. Redirecting to => login?url=${req.path}`);
    res.redirect(`login?url=${encodeURIComponent(req.path)}`);
  });

  // TODO   app.use(passport.initialize()); ???

  // Authentication login
  appPort.get('/login', passportPort.authenticate('digest', {session: false}),
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
  appProxy.get('/login',
    passportProxy.authenticate('reverseproxy', {session: false}),
  (req, res) => {
    // Authentication successful. Set user into session
    req.session.set('user', req.user.username);
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

  // Logout
  const logout = (req, res) => {
    if(req.session.get('user')) {
//      globals.log.info(`Logging out: ${req.session.get('user')}`);
      res.send('You are now logged out (<a href=login>login</a>)');
    } else {
//      globals.log.info('Already logged out');
      res.send('You are already logged out (<a href=login>login</a>)');
    }
    req.session.flush();
    req.session.regenerate();
  };

  appPort.get('/logout', logout);
  appProxy.get('/logout', logout);

  // About
  const about = (req, res) => {
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

      const methodFunction =
        ` ${currentStack.getMethodName() || ''} ` +
        `${currentStack.getFunctionName() || ''} `
        .replace(/ +/, ' ');

      return `[${index}] ` +
        `${currentModuleInfo} ` +
        `${path.basename(currentFile)}:${currentStack.getLineNumber()}` +
        `${methodFunction}`;
    })
    .join('\n');

    output += '</pre>';

    res.send(output);
  };

  appPort.get('/about', about);
  appProxy.get('/about', about);

  // Route for static files
  appPort.use(express.static(path.join(__dirname, '..', 'static')));
  appProxy.use(express.static(path.join(__dirname, '..', 'static')));

  // (Fallback) root route
  const root = (req, res) => {
    res.send('Jalousie');
  };

  appPort.get('/', root);
  appProxy.get('/', root);

  // Status
  const stat = (req, res) => {
//    globals.log.info('Status');
    res.json(status.dump());
  };

  appPort.get('/status', stat);
  appProxy.get('/status', stat);

  // Dump config
  const dumpConfig = (req, res) => {
    globals.log.info('Dump configuration');
    res.json(globals.config);
  };

  appPort.get('/dumpConfig', dumpConfig);
  appProxy.get('/dumpConfig', dumpConfig);

  // Read config
  const readConfig = (req, res) => {
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
  };

  appPort.get('/readConfig', readConfig);
  appProxy.get('/readConfig', readConfig);

  // Show logfile
  const showLogfile = (req, res) => {
    const logDir      = globals.config.logging.logDir;
    const logBasename = path.basename(process.argv[1]).replace(/\.js$/, '.log.');
    const logFilename = path.join(logDir, logBasename + moment().format('ddd'));

    globals.log.info('Show logfile');
    fsExtra.readFile(logFilename).then(logfile => {
      res.set('Content-Type', 'text/html').send(`<b>${logFilename}</b><p><pre>${logfile}</pre>`);
    })
    .catch(err => {
      globals.log.error(err);
      res.status(500).send(err);
    });
  };

  appPort.get('/showLogfile', showLogfile);
  appProxy.get('/showLogfile', showLogfile);

  // Stop
  const stop = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /stop');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_STOP');
      action.start(globals, 'JALOUSIE_STOP');
      res.send('ok');
    }
  };

  appPort.get('/stop', stop);
  appProxy.get('/stop', stop);

  // Full up
  const fullUp = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullUp');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_FULL_UP');
      action.start(globals, 'JALOUSIE_FULL_UP');
      res.send('ok');
    }
  };

  appPort.get('/fullUp', fullUp);
  appProxy.get('/fullUp', fullUp);

  // Full down
  const fullDown = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullDown');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_FULL_DOWN');
      action.start(globals, 'JALOUSIE_FULL_DOWN');
      res.send('ok');
    }
  };

  appPort.get('/fullDown', fullDown);
  appProxy.get('/fullDown', fullDown);

  // Shadow
  const shadow = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /shadow');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SHADOW');
      action.start(globals, 'JALOUSIE_SHADOW');
      res.send('ok');
    }
  };

  appPort.get('/shadow', shadow);
  appProxy.get('/shadow', shadow);

  // Turn
  const turn = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /turn');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_TURN');
      action.start(globals, 'JALOUSIE_TURN');
      res.send('ok');
    }
  };

  appPort.get('/turn', turn);
  appProxy.get('/turn', turn);

  // All Up
  const allUp = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allUp');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALL_UP');
      action.start(globals, 'JALOUSIE_ALL_UP');
      res.send('ok');
    }
  };

  appPort.get('/allUp', allUp);
  appProxy.get('/allUp', allUp);

  // All Down
  const allDown = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allDown');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_ALL_DOWN');
      action.start(globals, 'JALOUSIE_ALL_DOWN');
      res.send('ok');
    }
  };

  appPort.get('/allDown', allDown);
  appProxy.get('/allDown', allDown);

  // Individual
  const individual = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /individual');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_INDIVIDUAL');
      action.start(globals, 'JALOUSIE_INDIVIDUAL');
      res.send('ok');
    }
  };

  appPort.get('/individual', individual);
  appProxy.get('/individual', individual);

  // Special Test
  const specialTest = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /specialTest');
      res.send('windalarm');
    } else {
      globals.log.info('JALOUSIE_SPECIAL_TEST');
      action.start(globals, 'JALOUSIE_SPECIAL_TEST');
      res.send('ok');
    }
  };

  appPort.get('/specialTest', specialTest);
  appProxy.get('/specialTest', specialTest);

  // SSH web server, for direct port access
  /* eslint-disable no-sync */
  https.createServer({
    key:  fs.readFileSync('/etc/letsencrypt/live/heine7.de/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/heine7.de/cert.pem')
  }, appPort).listen(globals.config.webServerPortHttps);
  /* eslint-enable no-sync */

  globals.log.info(`Web server running on ` +
    `https://localhost:${globals.config.webServerPortHttps}`);

  // web server, for proxy access
  http.createServer(appProxy).listen(globals.config.webServerPortHttp);

  globals.log.info(`Web server running on ` +
    `http://localhost:${globals.config.webServerPortHttp}`);
};



module.exports = {
  startup
};
