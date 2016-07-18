#!/usr/bin/env node
'use strict';

const Status    = require('./status');



const status = new Status();

status.update({blubb: 'blah'});
status.update({trallala: 'lala'});
status.update({blubb: 'blubb'});
status.update({
  eins: 1,
  zwei: 2
});
