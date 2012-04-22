#!/usr/bin/env node

/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var recurrent = require('../recurrent.js');

var c = new recurrent.Client('q');

var remaining = 2;
c.add('t1', new Date().getTime() + 30000, function(err, results) {
  if(err)
    console.error('could not add');
  else
    console.error(results);
  --remaining;
  if (remaining === 0) {
    console.error('stopping');
    c.stop();
  }
});
c.add('t2', new Date().getTime() + 15000, function(err, results) {
  if(err)
    console.error('could not add');
  else
    console.error(results);
  --remaining;
  if (remaining === 0) {
    console.error('stopping');
    c.stop();
  }
});
