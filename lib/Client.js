/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');

module.exports = function (queueName) {
  var that = this;
  var client = redis.createClient();
  var listKey = queueName+ '_a';

  console.log('listKey', listKey);

  var quitting = false;
  var busyCount = 0;
  function markDone() {
    --busyCount;
    if(busyCount === 0) {
      if(quitting) {
        console.error('quitting now that done');
        client.quit();
      }
    }
  }

  that.add = function(id, when, cb) {
    ++busyCount;
    if(typeof when !== 'number' || Math.floor(when) !== when) {
      process.nextTick(function() { cb('when must be an integer'); markDone();});
    } else {
      client.rpush(listKey, JSON.stringify({id: id, when:when}), function(err, results) {
        markDone();
        cb(err, results);
      });
    }
  };

  that.quit = function() {
    if(busyCount === 0) {
      client.quit();
    } else {
      quitting = true;
    }
  };
};
