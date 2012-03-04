/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');

module.exports = function (queueName) {
  var that = this;
  var client = redis.createClient();
  var listKey = queueName+ '_a';

  console.log('listKey', listKey);

  that.add = function(id, when, cb) {
    if(typeof when !== 'number' || Math.floor(when) !== when) {
      process.nextTick(function() { cb('when must be an integer'); });
    } else {
      client.rpush(listKey, JSON.stringify({id: id, when:when}), cb);
    }
  };
};
