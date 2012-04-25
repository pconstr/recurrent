#!/usr/bin/env node

/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var assert = require('assert');

var startRedis = require('./startRedis.js');
var recurrent = require('../recurrent.js');
var _ = require('underscore');

startRedis(function(err, redis) {
  if(err) {
    throw err;
  }

  process.on('uncaughtException', function(err) {
    console.error(err.toString());
    redis.stop();
    process.exit(1);
  });

  var m = new recurrent.Manager('q').connect(6363);

  var counts = {};

  function doWork(taskId, cb) {
    assert(counts.hasOwnProperty(taskId));
    setTimeout(function() {
      counts[taskId]++;
      if(_.min(counts) < 3) {
        cb(null, new Date().getTime()+ 3000 + i * 1000);
      } else {
        cb(null, null);

        w.stop();
        m.stop();
        redis.stop();
        console.log('OK');
      }
    }, 500);
  }

  var w = new recurrent.Worker('q', doWork).connect(6363);

  var c = new recurrent.Client('q').connect(6363);
  var i;
  for(i = 1; i <=3 ; ++i) {
    counts['t'+ i] = 0;
    c.add('t'+ i, new Date().getTime()+ 200 * i, function(err, results) {
      if(err) {
        throw err;
      }
    });
  }
  c.stop();
});
