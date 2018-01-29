#!/usr/bin/env node

'use strict';

const http                 = require('http');
const path                 = require('path');

const findRoot             = require('find-root');
const stackTrace           = require('stack-trace');
const express              = require('express');
const jwt                  = require('express-jwt');
const jwksRsa              = require('jwks-rsa');
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


// Authentication / auth0

// Authentication middleware. When used, the
// access token must exist and be verified against
// the Auth0 JSON Web Key Set
const checkJwt = jwt({
  // Dynamically provide a signing key
  // based on the kid in the header and
  // the singing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache:                 false, // TODO true,
    rateLimit:             false, // TODO true,
    jwksRequestsPerMinute: 200, // TODO 5,
    jwksUri:               `https://sthones.eu.auth0.com/.well-known/jwks.json`
  }),

  // Validate the audience and the issuer.
  audience:   'https://heine7.de/j/rest',
  issuer:     `https://sthones.eu.auth0.com/`,
  algorithms: ['RS256']
});

const startup = function(globals) {
  // Start up web server
  const app = express();

  // human readable output for res.json()
  app.set('json spaces', '  ');

  // About
  const about = (req, res) => {
    let output = '<pre>';

    // TODO whoami?
//      output += `Authenticated as ${req.session.get('user')}\n`;

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

  app.get('/about', about);

  // Route for static files
  app.use(express.static(path.join(__dirname, '..', 'static')));
  app.use('/build', express.static(path.join(__dirname, '..', 'build')));

  // Status
  const stat = (req, res) => {
//    globals.log.info('Status');
    res.json(status.dump());
  };

  app.get('/rest/status', checkJwt, stat);

  // Dump config
  const dumpConfig = (req, res) => {
    globals.log.info('Dump configuration');
    res.json(globals.config);
  };

  app.get('/rest/dumpConfig', dumpConfig);

  // Read config
  const readConfig = (req, res) => {
    // Read configuration from file
    globals.log.info('Read configuration');
    configFile.read().then(newConfig => {
      globals.config = newConfig;
      res.send({ok: true});
    })
    .catch(err => {
      globals.log.error(err);
      res.status(500).send(err);
    });
  };

  app.get('/rest/readConfig', readConfig);

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

  app.get('/showLogfile', showLogfile);

  // Stop
  const stop = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /stop');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_STOP');
      action.start(globals, 'JALOUSIE_STOP');
      res.send({ok: true});
    }
  };

  app.get('/rest/stop', stop);

  // Full up
  const fullUp = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullUp');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_FULL_UP');
      action.start(globals, 'JALOUSIE_FULL_UP');
      res.send({ok: true});
    }
  };

  app.get('/rest/fullUp', fullUp);

  // Full down
  const fullDown = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /fullDown');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_FULL_DOWN');
      action.start(globals, 'JALOUSIE_FULL_DOWN');
      res.send({ok: true});
    }
  };

  app.get('/rest/fullDown', fullDown);

  // Shadow
  const shadow = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /shadow');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_SHADOW');
      action.start(globals, 'JALOUSIE_SHADOW');
      res.send({ok: true});
    }
  };

  app.get('/rest/shadow', shadow);

  // Turn
  const turn = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /turn');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_TURN');
      action.start(globals, 'JALOUSIE_TURN');
      res.send({ok: true});
    }
  };

  app.get('/rest/turn', turn);

  // All Up
  const allUp = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allUp');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_ALL_UP');
      action.start(globals, 'JALOUSIE_ALL_UP');
      res.send({ok: true});
    }
  };

  app.get('/rest/allUp', allUp);

  // All Down
  const allDown = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /allDown');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_ALL_DOWN');
      action.start(globals, 'JALOUSIE_ALL_DOWN');
      res.send({ok: true});
    }
  };

  app.get('/rest/allDown', allDown);

  // Individual
  const individual = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /individual');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_INDIVIDUAL');
      action.start(globals, 'JALOUSIE_INDIVIDUAL');
      res.send({ok: true});
    }
  };

  app.get('/rest/individual', individual);

  // Special Test
  const specialTest = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /specialTest');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_SPECIAL_TEST');
      action.start(globals, 'JALOUSIE_SPECIAL_TEST');
      res.send({ok: true});
    }
  };

  app.get('/rest/specialTest', specialTest);

  // web server, for proxy access
  http.createServer(app).listen(globals.config.webServerPortHttp);

  globals.log.info(`Web server running on ` +
    `http://localhost:${globals.config.webServerPortHttp}`);
};



module.exports = {
  startup
};
