/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');

module.exports = function (queueName) {
  var that = this;
  var client = redis.createClient();

  client.on('error', function(err) {
    console.error(err);
  });

  var listKey = queueName+ '_a';

  console.log('listKey', listKey);

  var quitting = false;
  var busyCount = 0;

  function clientQuit() {
    if(!client.connected) {
      // FIXME: this is to work around a bug in the redis client where it will keep retrying a reconnection just to send the QUIT request
      // FIXME: actually go and report bug
      client.closing = true;
    }
    client.quit();
  }

  function markDone() {
    --busyCount;
    if(busyCount === 0) {
      if(quitting) {
        clientQuit();
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
      clientQuit();
    } else {
      quitting = true;
    }
  };
};
