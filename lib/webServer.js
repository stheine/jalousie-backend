'use strict';

/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/consistent-function-scoping */

const http                 = require('http');
const path                 = require('path');

const express              = require('express');
const findRoot             = require('find-root');
const fsExtra              = require('fs-extra');
const jwt                  = require('express-jwt');
// const jwtAuthz             = require('express-jwt-authz');
const jwksRsa              = require('jwks-rsa');
const moment               = require('moment');
const stackTrace           = require('stack-trace');

const configFile           = require('./configFile');
const status               = require('./status');



const readPackageJson = function(filename) {
  try {
    /* eslint-disable global-require */
    const packageJson = require(path.join(filename, 'package.json'));
    /* eslint-enable global-require */

    return {
      name:    packageJson.name,
      version: packageJson.version,
    };
  } catch(err) {
    return {
      name:    filename,
      version: 'node',
    };
  }
};


// Authentication / auth0

// Authentication middleware. When used, the
// Access Token must exist and be verified against
// the Auth0 JSON Web Key Set
const authConfig = {
  domain:   'sthones.eu.auth0.com',
  audience: 'https://myhome.heine7.de/backend/',
};

const checkJwt = jwt({
  // Dynamically provide a signing key
  // based on the kid in the header and
  // the signing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache:                 true,
    rateLimit:             true,
    jwksRequestsPerMinute: 5,
    jwksUri:               `https://${authConfig.domain}/.well-known/jwks.json`,
  }),

  audience:                authConfig.audience,
  issuer:                  `https://${authConfig.domain}/`,
  algorithms:              ['RS256'],
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
      const currentFile = currentStack.getFileName();
      let   currentModuleInfo;

      try {
        const currentRoot    = findRoot(currentFile) || currentFile;
        const currentPackage = readPackageJson(currentRoot);

        currentModuleInfo = `${currentPackage.name}#${currentPackage.version}`;
      } catch(err) {
        currentModuleInfo = '';
      }

      const methodFunction = ` ${currentStack.getMethodName() || ''} ${currentStack.getFunctionName() || ''} `
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
  app.use(express.static(path.join(__dirname, '..', 'build')));

//  // Endpoint to serve the authentication configuration file
//  app.get("/auth_config.json", (req, res) => {
//    res.sendFile(path.join(__dirname, '..', 'build', 'auth_config.json'));
//  });

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
  const readConfig = async(req, res) => {
    // Read configuration from file
    try {
      globals.log.info('Read configuration');
      const newConfig = await configFile.read();

      globals.config = newConfig;
      res.send({ok: true});
    } catch(err) {
      globals.log.error(err);
      res.status(500).send(err);
    }
  };

  app.get('/rest/readConfig', readConfig);

  // Show logfile
  const showLogfile = async(req, res) => {
    try {
      const logDir      = globals.config.logging.logDir;
      const logBasename = path.basename(process.argv[1]).replace(/\.js$/, '.log.');
      const logFilename = path.join(logDir, logBasename + moment().format('ddd'));

      globals.log.info('Show logfile');
      const logfile = await fsExtra.readFile(logFilename);

      res.set('Content-Type', 'text/html').send(`<b>${logFilename}</b><p><pre>${logfile}</pre>`);
    } catch(err) {
      globals.log.error(err);
      res.status(500).send(err);
    }
  };

  app.get('/showLogfile', showLogfile);

  // Stop
  const stop = (req, res) => {
    if(globals.flagWindalarm) {
      globals.log.info('flagWindalarm suppress /stop');
      res.send({ok: false, message: 'windalarm'});
    } else {
      globals.log.info('JALOUSIE_STOP');
      globals.action.start('JALOUSIE_STOP');
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
      globals.action.start('JALOUSIE_FULL_UP');
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
      globals.action.start('JALOUSIE_FULL_DOWN');
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
      globals.action.start('JALOUSIE_SHADOW');
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
      globals.action.start('JALOUSIE_TURN');
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
      globals.action.start('JALOUSIE_ALL_UP');
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
      globals.action.start('JALOUSIE_ALL_DOWN');
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
      globals.action.start('JALOUSIE_INDIVIDUAL');
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
      globals.action.start('JALOUSIE_SPECIAL_TEST');
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
  startup,
};
