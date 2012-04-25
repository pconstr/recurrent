/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var redis  = require('redis');

module.exports = function (queueName, func, options) {
  var that = this;

  if(!options) {
    options = {};
  }

  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var listKey = queueName+ '_a';
  var dataKey = queueName+ '_d';

  var ready = true;

  var pullClient;
  var pushClient;

  var stopping = false;

  var minBackOff = options.minBackOff || 5000; // 5s
  var backOffMultiplier = options.backOffMultipler || 1.5; // 50% longer each time
  var maxBackOff = options.maxBackOff || 1000000; // 1000s

  function computeBackOff(retries) {
    var t = minBackOff * Math.pow(backOffMultiplier, retries - 1);
    if(t > maxBackOff) {
      t = maxBackOff;
    }
    return t;
  }

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
    pullClient.brpoplpush(pendingListKey, takenListKey, 0, function(err, taskId) {
      if(err) {
        return cancel(err);
      }
      if(that.debug) {
        console.log('pulled out', results);
      }

      pullClient.hget(dataKey, taskId, function(err, taskDataJSON) {

        var task = {id: taskId};
        if(taskDataJSON !== null) {
          var bundle = JSON.parse(taskDataJSON);
          if(bundle.data !== undefined) {
            task.data = bundle.data;
          }
          if(bundle.retries !== undefined) {
            task.retries = bundle.retries;
          }
        }

        func(task, function(err, when) {
          if(err) {
            task.retries = 1 + (task.retries || 0);
            console.error(taskId, 'failed ('+ task.retries+ '): ', err);
            if(!when) {
              var t = computeBackOff(task.retries);
              console.log('backing off for', t, 'ms');
              when = new Date().getTime() + t;
            }
            console.error('will retry', taskId, 'at ', when);
          } else {
            delete task.retries;
          }
          if(that.debug) {
            console.log(taskId, 'succeeded. next run is at', when);
          }
          var info = {id: taskId, when: when};
          if(task.data !== undefined) {
            info.data = task.data;
          }
          if(task.retries !== undefined) {
            info.retries = task.retries;
          }
          // FIXME: find a way to recover from broken connection in multi
          pushClient.multi()
            .lrem(takenListKey, 0, taskId, function(err) {
              if(err)
                console.error(err)
            })
            .rpush(listKey, JSON.stringify(info), function(err) {
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
