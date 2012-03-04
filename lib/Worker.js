/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');

module.exports = function (queueName) {
  var that = this;

  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var listKey = queueName+ '_a';

  var waitingForReconnection = false;

  var pullClient = redis.createClient();
  var pushClient = redis.createClient();

  function dealWithReconnection() {
    if(waitingForReconnection && pullClient.connected && pushClient.connected) {
      console.error('alive again!');
      waitingForReconnection = false;
      handle();
    }
  }

  pullClient.on('error', function(err) {
    console.error(err);
  });
  pullClient.on('ready', function() {
    console.error('pullClient ready');
    dealWithReconnection();
  });
  pullClient.on('reconnecting', function() {
    console.error('pullClient reconnecting...');
  });
  pushClient.on('error', function(err) {
    console.error(err);
  });
  pushClient.on('ready', function() {
    console.error('pushClient ready');
    dealWithReconnection();
  });
  pushClient.on('reconnecting', function() {
    console.error('pullClient reconnecting...');
  });

  function handle() {
    console.error('pulling from', pendingListKey);

    function cancel(err) {
      console.error('!!!!!!!!!! cancelling !!!!!!!!!!!');
      console.error(err);

      if(pullClient.connected && pushClient.connected) {
        // don't know how to deal with this
        throw err;
      }

      // either pullClient or pushClient is disconnected, retry only once they are both connected again
      waitingForReconnection = true;
    }

    pullClient.brpoplpush(pendingListKey, takenListKey, 0, function(err, results) {
      if(err) {
        console.error('brpoplpush failed');
        return cancel(err);
      }
      console.error('pulled out', results);
      var taskId = results;
      that.do(taskId, function(err, when) {
        if(err) {
          console.error(taskId, 'failed', err);
          throw 'FIXME: deal with task failure';
        }
        console.error(taskId, 'succeeded. next run is at', when);
        pushClient.multi(function(err) { console.error('multi failed!'); })
          .lrem(takenListKey, 0, taskId, function(err) {
            if(err)
              console.error('.lrem failed', err)
          })
          .rpush(listKey, JSON.stringify({id: taskId, when: when}), function(err) {
            if(err)
              console.error('.rpush failed', err);
          })
          .exec(function(err, results) {
            if(err) {
              console.error('.exec failed', err);
              return cancel(err);
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
};
