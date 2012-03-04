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
      waitingForReconnection = false;
      handle();
    }
  }

  pullClient.on('error', function(err) {
    console.error(err);
  });
  pullClient.on('ready', function() {
    dealWithReconnection();
  });
  pushClient.on('error', function(err) {
    console.error(err);
  });
  pushClient.on('ready', function() {
    dealWithReconnection();
  });

  function handle() {

    function cancel(err) {
      console.error(err);

      if(pullClient.connected && pushClient.connected) {
        // don't know how to deal with this
        throw err;
      }

      // either pullClient or pushClient is disconnected, retry only once they are both connected again
      waitingForReconnection = true;
    }

    if(that.debug) {
      console.error('pulling...');
    }
    pullClient.brpoplpush(pendingListKey, takenListKey, 0, function(err, results) {
      if(err) {
        return cancel(err);
      }
      if(that.debug) {
        console.error('pulled out', results);
      }
      var taskId = results;
      that.do(taskId, function(err, when) {
        if(err) {
          console.error(taskId, 'failed', err);
          throw 'FIXME: deal with task failure';
        }
        if(that.debug) {
          console.error(taskId, 'succeeded. next run is at', when);
        }
        pushClient.multi(function(err) { console.error(err); })
          .lrem(takenListKey, 0, taskId, function(err) {
            if(err)
              console.error(err)
          })
          .rpush(listKey, JSON.stringify({id: taskId, when: when}), function(err) {
            if(err)
              console.error(err);
          })
          .exec(function(err, results) {
            if(err) {
              return cancel(err);
            }
            if(that.debug) {
              console.error('pushed', taskId, 'follow up');
            }
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
