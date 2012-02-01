/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');

function Worker(queueName) {
  var that = this;

  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var listKey = queueName+ '_a';

  var pullClient = redis.createClient();
  var pushClient = redis.createClient();

  function handle() {
    console.error('pulling from', pendingListKey);
    pullClient.brpoplpush(pendingListKey, takenListKey, 0, function(err, results) {
      if(err !== null) {
        console.error('brpoplpush', err);
        return setTimeout(handle, 300);
      }
      console.error('pulled out', results);
      var taskId = results;
      that.do(taskId, function(err, when) {
        if(err) {
          console.error(taskId, 'failed', err);
          // FIXME: handle this
          return;
        }
        console.error(taskId, 'succeeded. next run is at', when);
        pushClient.multi()
          .lrem(takenListKey, 0, taskId)
          .rpush(listKey, JSON.stringify({id: taskId, when: when}), function(err, pushResult) {
            if(err) {
              console.error(err);
              // FIXME: handle this;
              return;
            }
          })
          .exec(function(err, results) {
            if(err) {
              console.error(err);
              // FIXME: handle this;
              return;
            }
            console.error('pushed follow up');
          });
      });

      // FIXME: unlimited concurrency is probably not a good idea
      process.nextTick(handle);
    });
  }

  that.go = function() {
    handle();
  };
}

function Client(queueName) {
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
}

exports.Worker = Worker;
exports.Client = Client;
