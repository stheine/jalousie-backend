'use strict';

// server.js
// from
// https://auth0.com/docs/quickstart/backend/nodejs/01-authorization

const http = require('http');
const path = require('path');

const express = require('express');
const app = express();
const jwt = require('express-jwt');
const jwtAuthz = require('express-jwt-authz');
const jwksRsa = require('jwks-rsa');

// Authentication middleware. When used, the
// access token must exist and be verified against
// the Auth0 JSON Web Key Set
const checkJwt = jwt({
  // Dynamically provide a signing key
  // based on the kid in the header and
  // the signing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://sthones.eu.auth0.com/.well-known/jwks.json`
  }),

  // Validate the audience and the issuer.
  audience: 'https://heine7.de/j/rest',
  issuer: `https://sthones.eu.auth0.com/`,
  algorithms: ['RS256']
});


// Static route for the ui
app.use('/build', express.static(path.join(__dirname, '..', 'build')));

// This route doesn't need authentication
app.get('/rest/public', function(req, res) {
  res.json({
    message: 'Hello from a public endpoint! You don\'t need to be authenticated to see this.'
  });
});

app.get('/rest/status', function(req, res) {
  res.json({
    temp: 12.34,
    status: 'ok',
  });
});

// This route need authentication
app.get('/rest/private', checkJwt, function(req, res) {
  res.json({
    message: 'Hello from a private endpoint! You need to be authenticated to see this.'
  });
});

http.createServer(app).listen(9125);

