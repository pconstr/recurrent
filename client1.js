#!/usr/bin/env node

var recurrent = require('./recurrent.js');

var c = new recurrent.Client('q');

c.add('t1', new Date().getTime() + 30000, function(err, results) {
  if(err)
    throw err;
  console.log(results);
});
