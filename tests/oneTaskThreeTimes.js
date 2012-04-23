#!/usr/bin/env node

/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var assert = require('assert');

var startRedis = require('./startRedis.js');
var recurrent = require('../recurrent.js');

startRedis(function(err, redis) {
  if(err) {
    throw err;
  }

  process.on('uncaughtException', function(err) {
    console.error(err.toString());
    redis.stop();
    process.exit(1);
  });

  var m = new recurrent.Manager('q', 6789);

  var count = 0;

  function doWork(taskId, cb) {
    assert.equal(taskId, 't1');
    setTimeout(function() {
      count++;
      if(count < 3) {
        cb(null, new Date().getTime()+ 5000);
      } else {
        cb(null, null);

      w.stop();
        m.stop();
        redis.stop();
        console.log('OK');
      }
    }, 500);
  }

  var w = new recurrent.Worker('q', doWork);

  var c = new recurrent.Client('q');
  c.add('t1', new Date().getTime()+ 500, function(err, results) {
    if(err) {
      throw err;
    }
  });
  c.stop();
});
