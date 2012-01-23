#!/usr/bin/env node

var redis  = require('redis');

function Manager(queueName) {
  var that = this;

  var listClient = redis.createClient();
  listClient.on('error', function(err) {
    console.log(err);
  });

  var zsetClient = redis.createClient();
  zsetClient.on('error', function(err) {
    console.log(err);
  });

  var addListKey = queueName+ '_a';
  var pendingListKey = queueName+ '_p';
  var takenListKey = queueName+ '_t';
  var zsetKey = queueName+ '_z';

  var timebox = 3000; // 3s

  var pickTimeoutId = null;

  var queuedAdds = [];

  function isTimeboxEnd(t) {
    return Math.floor(t) !== t;
  }
  
  function handleList() {
  
    console.error('pulling from', addListKey);

    // FIXME: what if the manager crashes before processing this message? don't just pop it, move it to a separate queue

    listClient.blpop(addListKey, 0, function(err, results) {
      if(err !== null) {
        console.error('blpop', err);
        return setTimeout(handleList, 300);
      }
      console.error('manager pulled out', results);
      var mJSON = results[1];
      var m;
      try {
        m = JSON.parse(mJSON);
      } catch(parseErr) {
        console.error(parseErr);
        return process.nextTick(handleList);
      }
      console.error('m',m);
      
      var taskId = m.id;
      var taskWhen = m.when;
      
      if(taskId === undefined) {
        console.error('undefined taskId');
        return process.nextTick(handleList);
      }
      if(taskWhen === undefined) {
        console.error('undefined task-when');
        return process.nextTick(handleList);
      }
      if(taskWhen !== null && (typeof taskWhen !== 'number' || Math.floor(taskWhen) !== taskWhen)) {
        console.error('task-when must be null or an integer');
        return process.nextTick(handleList);
      }

      console.error('queueing', m);
      queuedAdds.push(m);
      console.error('nudging pick');
      nudgePick();

      process.nextTick(handleList);
    });
  }

  function exec(taskId) {
    console.log('todo', taskId);
    zsetClient.lpush(pendingListKey, taskId, function(err, result) {
      if(err) {
        console.error('could not push', taskId, 'to pending');
        // FIXME: keep on trying?
        return;
      }
      console.log(taskId, 'pushed to pending');
    });
  }

  var inPick = false;

  function pickTimeout() {
    inPickTimeout = true;
    if(pickTimeoutId !== null) {
      clearTimeout(pickTimeoutId);
      pickTimeoutId = null;
    }

    console.error('pick in...');
    inPick = true;

    if(queuedAdds.length > 0) {
      var m = queuedAdds.shift();
      console.error('shifted', m);
      var taskId = m.id;
      var taskWhen = m.when;
      if(taskWhen === null) {
        zsetClient.zrem(zsetKey, taskId, function(err, result) {
          if(err) {
            console.error(err);
            // FIXME: handle this
            throw 'fixme';
          }
          inPick = false;
          pickTimeoutId = setTimeout(pickTimeout, 0);
        });
      } else {
        console.error('zadd(1)', taskWhen, 'on', taskId);
        zsetClient.zadd(zsetKey, taskWhen, taskId, function(err, result) {
          if(err) {
            console.error(err);
            // FIXME: handle this
            throw 'fixme';
          }
          console.error('zadd(1) succeeded');
          inPick = false;
          pickTimeoutId = setTimeout(pickTimeout, 0);
        });
      }
      return;
    }

    console.error('calling pick...');
    pick(function(nextTime, now) {
      console.log('nextTime = ', nextTime);
      if(queuedAdds.length > 0)
        nextTime = now;
      if(nextTime !== null) {
        var wait = nextTime - now;
        console.error('wait', wait);
        pickTimeoutId = setTimeout(pickTimeout, wait);
      } else
        console.error('nothing to wait for');
      inPick = false;
      console.error('... out pick');
    });
  }

  function nudgePick() {
    // if inPick we can rely on the queue being check before setting inPick back to false
    // but otherwise we want to make sure the pick timeout will run right away
    if(!inPick) {
      console.error('!inPick');
      if(pickTimeoutId) {
        clearTimeout(pickTimeoutId);
        pickTimeoutId = null;
      }
      console.error('setting 0 timeout');
      return pickTimeoutId = setTimeout(pickTimeout, 0);
    }
  }

  function pick(cb) {
    zsetClient.zrangebyscore(zsetKey, '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1, function(err, result) {
      if(err) {
        throw err;
      }

      var now = new Date().getTime();
      
      if(result.length === 0) {
        console.error('nothing yet to pick');
        return cb(null, now);
      }

      console.log('result', result);
      
      var taskId = result[0];
      var targetTime = parseFloat(result[1]);

      if(targetTime > now) {
        console.log('next task', taskId, 'only at', targetTime, 'now', now);
        return cb(targetTime, now);
      }

      var isTb = isTimeboxEnd(targetTime);

      if(isTb) {
        console.error(taskId, 'taking too long');
        // FIXME: check if it was picked up
      } else {
        exec(taskId);
      }

      var tbTime = now + timebox + 0.5;
      console.log('zadd(2)', tbTime, 'on', taskId); 
      zsetClient.zadd(zsetKey, tbTime , taskId, function(err, result) {
        if(err)
          throw err; // FIXME - handle this properly
        console.log('zadd(2) successful');
        console.error('will check on', taskId, 'at', tbTime);        
        return cb(tbTime, now);
      });
    });
  }
  
  function handlezset() {
    pickTimeout();
  }

  that.go = function() {
    handleList();
    handlezset();
  };
}

var m = new Manager('q');
m.go();
