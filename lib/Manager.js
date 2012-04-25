/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var url = require('url');

var countdown = require('countdown');
var redis  = require('redis');

module.exports = function (queueName, port) {
  var that = this;

  function cancel(err) {
    console.error(err);
    if(addClient.connected && shuffleClient.connected) {
      // don't know how to deal with this
      throw err;
    }
    ready = false;
  }

  var ready = false;
  function checkReady() {
    if(!ready && addClient.ready && shuffleClient.ready) {
      if(that.debug) {
        console.log('got ready');
      }
      shuffleClient.zrange(zsetKey, 0, 10000, 'withscores', function(err, result) {
        if(err) {
          return cancel(err);
        }
        var i;
        for(i = 0; i < result.length; i += 2) {
          var taskId = result[i];
          var taskTime = result[i + 1];
          taskCache[taskId] = taskTime;
        }
        if(that.debug) {
          console.error(result);
        }
        handleAdd();
        handleShuffle();
      });
    }
  }

  var stopping = false;

  var addClient;
  var shuffleClient;

  var addListKey = queueName+ '_a';
  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var zsetKey = queueName+ '_z';
  var dataKey = queueName+ '_d';

  var timebox = 3000; // 3s

  var pickTimeoutId = null;

  var queuedAdds = [];

  function isTimeboxEnd(t) {
    return Math.floor(t) !== t;
  }

  function handleAdd() {
    if(stopping) {
      return true;
    }

    if(that.debug) {
      console.log('pulling from', addListKey);
    }

    function cancel(err) {
      console.error(err);
      if(addClient.connected && shuffleClient.connected) {
        // don't know how to deal with this
        throw err;
      }
      ready = false;
    }

    // FIXME: what if the manager crashes before processing this message? don't just pop it, move it to a separate queue

    addClient.blpop(addListKey, 0, function(err, results) {
      if(err) {
        return cancel(err);
      }
      if(that.debug) {
        console.log('manager pulled out', results);
      }
      var mJSON = results[1];
      var m;
      try {
        m = JSON.parse(mJSON);
      } catch(parseErr) {
        console.error(parseErr);
        return process.nextTick(handleAdd);
      }

      var taskId = m.id;
      var taskWhen = m.when;

      if(taskId === undefined) {
        console.error('undefined taskId');
        return process.nextTick(handleAdd);
      }
      if(taskWhen === undefined) {
        console.error('undefined task-when');
        return process.nextTick(handleAdd);
      }
      if(taskWhen !== null && (typeof taskWhen !== 'number' || Math.floor(taskWhen) !== taskWhen)) {
        console.error('task-when must be null or an integer');
        return process.nextTick(handleAdd);
      }

      if(that.debug) {
        console.log('queueing', m);
      }
      queuedAdds.push(m);
      if(that.debug) {
        console.log('nudging pick');
      }
      nudgePick();

      process.nextTick(handleAdd);
    });
  }

  function exec(taskId) {
    if(that.debug) {
      console.log('todo', taskId);
    }
    shuffleClient.lpush(pendingListKey, taskId, function(err, result) {
      if(err) {
        return cancel(err);
      }
      if(that.debug) {
        console.error(taskId, 'pushed to pending');
      }
    });
  }

  function putBack(taskId) {
    if(that.debug) {
      console.log('putting', taskId, 'back in pending queue');
    }
    shuffleClient.watch(takenListKey, function(err, result) {
      if(err) {
        return cancel(err);
      }
      shuffleClient.lrange(takenListKey, 0, 10000, function(err, taken) {
        if(err) {
          return cancel(err);
        }
        if(that.debug) {
          console.log('taken', taken);
        }
        if(taken.indexOf(taskId) !== -1) {
          if(that.debug) {
            console.log(taskId, 'is still taken');
          }

          shuffleClient.multi()
            .lrem(takenListKey, 0, taskId, function(err, result) {
              if(err) {
                console.error(err);
              }
            })
            .rpush(pendingListKey, taskId, function(err, result) {
              if(err) {
                console.error(err);
              } else {
                if(that.debug) {
                  console.log(taskId, 'back in pending queue');
                }
              }
            })
            .exec(function(err, results) {
              if(err) {
                return cancel(err);
              }
              if(that.debug) {
                console.log('results', results);
              }
            });

        } else {
          shuffleClient.unwatch();
          if(that.debug) {
            console.log(taskId, 'is not taken...');
          }
        }
      });
    });
  }

  var inPick = false;

  function pickTimeout() {
    if(pickTimeoutId !== null) {
      clearTimeout(pickTimeoutId);
      pickTimeoutId = null;
    }

    if(that.debug) {
      console.log('pick in...');
    }
    inPick = true;

    if(queuedAdds.length > 0) {
      var m = queuedAdds.shift();
      if(that.debug) {
        console.log('shifted', m);
      }
      var taskId = m.id;
      var taskWhen = m.when;
      if(taskWhen === null) {
        // FIXME: do it atomically
        shuffleClient.hdel(dataKey, taskId, function(err, result) {
          if(err) {
            return cancel(err);
          }
        });
        shuffleClient.zrem(zsetKey, taskId, function(err, result) {
          if(err) {
            return cancel(err);
          }
          inPick = false;
          pickTimeoutId = setTimeout(pickTimeout, 0);
        });
      } else {
        if(that.debug) {
          console.log('zadd(1)', taskWhen, 'on', taskId);
        }
        // FIXME: do it atomically
        if(m.data !== undefined || m.retries !== undefined) {
          shuffleClient.hset(dataKey, taskId, JSON.stringify({data: m.data, retries: m.retries}), function(err) {
            if(err) {
              return cancel();
            }
          });
        }
        shuffleClient.zadd(zsetKey, taskWhen, taskId, function(err, result) {
          if(err) {
            return cancel();
          }
          if(that.debug) {
            console.log('zadd(1) succeeded');
          }
          taskCache[taskId] = taskWhen;
          inPick = false;
          pickTimeoutId = setTimeout(pickTimeout, 0);
        });
      }
      return;
    }

    if(that.debug) {
      console.log('calling pick...');
    }
    pick(function(nextTime, now) {
      if(that.debug) {
        console.log('nextTime = ', nextTime);
      }
      if(queuedAdds.length > 0)
        nextTime = now;
      if(nextTime !== null) {
        var wait = nextTime - now;
        if(that.debug) {
          console.log('wait', wait);
        }
        pickTimeoutId = setTimeout(pickTimeout, wait);
      } else {
        if(that.debug) {
          console.log('nothing to wait for');
        }
      }
      inPick = false;
      if(that.debug) {
        console.log('... out pick');
      }
    });
  }

  function nudgePick() {
    // if inPick we can rely on the queue being check before setting inPick back to false
    // but otherwise we want to make sure the pick timeout will run right away
    if(!inPick) {
      if(that.debug) {
        console.log('!inPick');
      }
      if(pickTimeoutId) {
        clearTimeout(pickTimeoutId);
        pickTimeoutId = null;
      }
      if(that.debug) {
        console.log('setting 0 timeout');
      }
      return pickTimeoutId = setTimeout(pickTimeout, 0);
    }
  }

  function pick(cb) {
    shuffleClient.zrangebyscore(zsetKey, '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1, function(err, result) {
      if(err) {
        return cancel(err);
      }

      var now = new Date().getTime();

      if(result.length === 0) {
        if(that.debug) {
          console.log('nothing yet to pick');
        }
        return cb(null, now);
      }

      if(that.debug) {
        console.log('result', result);
      }

      var taskId = result[0];
      var targetTime = parseFloat(result[1]);

      taskCache[taskId] = targetTime;

      if(targetTime > now) {
        if(that.debug) {
          console.log('next task', taskId, 'only at', targetTime, 'now', now);
        }
        return cb(targetTime, now);
      }

      var isTb = isTimeboxEnd(targetTime);

      // FIXME: shouldn't putback/exec be done atomically with the zadd bellow?

      if(isTb) {
        if(that.debug) {
          console.log(taskId, 'taking too long');
        }
        putBack(taskId);
      } else {
        exec(taskId);
      }

      var tbTime = now + timebox + 0.5;
      if(that.debug) {
        console.log('zadd(2)', tbTime, 'on', taskId);
      }
      shuffleClient.zadd(zsetKey, tbTime , taskId, function(err, result) {
        if(err) {
          return cancel(err);
        }
        if(that.debug) {
          console.log('zadd(2) successful');
        }
        taskCache[taskId] = tbTime;
        if(that.debug) {
          console.log('will check on', taskId, 'at', tbTime);
        }
        return cb(tbTime, now);
      });
    });
  }

  function handleShuffle() {
    if(stopping) {
      return;
    }
    pickTimeout();
  }

  var taskCache = {};

  that.connect = function() {
    addClient = redis.createClient.apply(redis, arguments);
    addClient.on('error', function(err) {
      console.error(err);
    });
    addClient.on('ready', function() {
      checkReady();
    });

    shuffleClient = redis.createClient.apply(redis, arguments);
    shuffleClient.on('error', function(err) {
      console.error(err);
    });
    shuffleClient.on('ready', function() {
      checkReady();
    });
    return that;
  };

  that.stop = function() {
    addClient.removeAllListeners();
    addClient.end();
    addClient.removeAllListeners();
    shuffleClient.end();
    clearTimeout(pickTimeoutId);
    stopping = true;
    return that;
  };

  that.webUI = function(req, res) {
    function descTimeRemaining(ta, tb) {
      var dt = tb - ta;
      if(dt < 1000)
        return 'less than 1 second';
      return countdown(ta, tb).toString(2);
    }

    if(stopping) {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      return res.end('stopped\n');
    }

    var parsedUrl = url.parse(req.url, true);
    if(parsedUrl.pathname === '/') {
      var now = new Date();
      var nowTime = now.getTime();
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write('<html><head></head><body>');
      res.write('<ul>');
      var i;
      var taskId;
      for(taskId in taskCache) {
        var taskTime = taskCache[taskId];
        res.write('<li>');
        res.write('<span>'+ taskId+ '</span>');
        res.write('<span>:</span>');
        if(nowTime >= taskTime)
          res.write('<span>just starting</span>');
        else {
          if(Math.floor(taskTime) === taskTime)
            res.write('<span>due in '+ descTimeRemaining(nowTime, taskTime)+ '</span>');
          else
            res.write('<span>running, will timeout in '+ descTimeRemaining(nowTime, taskTime)+ '</span>');
        }
        res.write('</li>');
      }
      res.write('</ul>');
      res.write('</body></html>');
      res.end();
    } else {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      return res.end('page not found');
    }
  };
};
