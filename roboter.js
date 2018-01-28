'use strict';

const path    = require('path');

const roboter = require('roboter');

roboter.
  workOn('server').
  equipWith(task => {
    task('client/build-app', {
//      entryFiles: [
//        'index.html',
//        'index.scss',
//        'index.js'
//      ],
      babelize: [
        path.join(__dirname, 'src'),
      ],
//      buildDir: 'build/',
//      publicPath: '/'
    });

    task('client/watch-app', {
      entryFiles: [
        'src/index.html',
        'src/index.scss',
        'src/index.js'
      ],
      buildDir: 'build/',
      babelize: [
        path.join(__dirname, 'src'),
        path.join(__dirname, 'node_modules', 'my-es2015-dependency')
      ],
      https: false,
      host: 'localhost',
      port: 9125,
      hotReloading: true
    });
  }).
  start();
