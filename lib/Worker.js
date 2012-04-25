/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var redis  = require('redis');

module.exports = function (queueName, func) {
  var that = this;

  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var listKey = queueName+ '_a';

  var ready = true;

  var pullClient;
  var pushClient;

  var stopping = false;

  function checkReady() {
    if(!ready && pullClient.ready && pushClient.ready) {
      ready = true;
      handle();
    }
  }

  function handle() {

    if(stopping) {
      return;
    }

    function cancel(err) {
      console.error(err);

      if(pullClient.connected && pushClient.connected) {
        // don't know how to deal with this
        throw err;
      }

      // either pullClient or pushClient is disconnected, retry only once they are both connected again
      ready = false;
    }

    if(that.debug) {
      console.log('pulling...');
    }
    pullClient.brpoplpush(pendingListKey, takenListKey, 0, function(err, results) {
      if(err) {
        return cancel(err);
      }
      if(that.debug) {
        console.log('pulled out', results);
      }
      var taskId = results;
      func(taskId, function(err, when) {
        if(err) {
          console.error(taskId, 'failed', err);
          throw 'FIXME: deal with task failure';
        }
        if(that.debug) {
          console.log(taskId, 'succeeded. next run is at', when);
        }
        // FIXME: find a way to recover from broken connection in multi
        pushClient.multi()
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
              console.log('pushed', taskId, 'follow up');
            }
          });
      });

      // FIXME: unlimited concurrency is probably not a good idea
      process.nextTick(handle);
    });
  }

  that.connect = function() {
    pullClient = redis.createClient.apply(redis, arguments);
    pushClient = redis.createClient.apply(redis, arguments);
    pullClient.on('error', function(err) {
      console.error(err);
    });
    pullClient.on('ready', function() {
      checkReady();
    });
    pushClient.on('error', function(err) {
      console.error(err);
    });
    pushClient.on('ready', function() {
      checkReady();
    });
    handle();
    return that;
  };

  that.stop = function() {
    stopping = true;
    pullClient.removeAllListeners();
    pullClient.end();
    pushClient.removeAllListeners();
    pushClient.end();
    return that;
  };
};
