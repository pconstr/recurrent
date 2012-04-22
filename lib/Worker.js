/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var redis  = require('redis');

module.exports = function (queueName) {
  var that = this;

  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var listKey = queueName+ '_a';

  var ready = true;

  var pullClient = redis.createClient();
  var pushClient = redis.createClient();

  var stopping = false;

  function checkReady() {
    if(!ready && pullClient.ready && pushClient.ready) {
      ready = true;
      handle();
    }
  }

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
      that.do(taskId, function(err, when) {
        if(err) {
          console.error(taskId, 'failed', err);
          throw 'FIXME: deal with task failure';
        }
        if(that.debug) {
          console.log(taskId, 'succeeded. next run is at', when);
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
              console.log('pushed', taskId, 'follow up');
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
  that.stop = function() {
    stopping = true;
    pullClient.removeAllListeners();
    pullClient.end();
    pushClient.removeAllListeners();
    pushClient.end();
  };
};
