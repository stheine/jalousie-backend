'use strict';

const path    = require('path');

const roboter = require('roboter');

roboter.
  workOn('client').
  equipWith(task => {
    task('client/build-app', {
//      entryFiles: [
//        'index.html',
//        'index.scss',
//        'index.js'
//      ],
      babelize: [
        path.join(__dirname, 'src'),
        path.join(__dirname, 'node_modules/request'),
      ],
//      buildDir: 'build/',
//      publicPath: '/'
    });

    task('client/watch-app', {
//      entryFiles: [
//        'index.html',
//        'index.scss',
//        'index.js'
//      ],
      buildDir: path.join(__dirname, 'watchBuild/'),
      babelize: [
        path.join(__dirname, 'src'),
//        path.join(__dirname, 'node_modules', 'my-es2015-dependency')
      ],
      https: false,
      host: '0.0.0.0',
      port: 9125,
      hotReloading: true
    });
  }).
  start();