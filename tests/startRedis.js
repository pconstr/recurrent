/* Copyright 2011-2012 Carlos Guerreiro
 *   http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

var child_process = require('child_process');
var carrier = require('carrier');

module.exports = function(cb) {
  var ready = /.*The server is now ready to accept connections on port.*/;
  var p = child_process.spawn('redis-server', ['redis.conf']);
  var started = false;
  var stopping = false;
  p.on('exit', function(code, signal) {
    if(stopping) {
      return;
    }
    if(code !== null) {
      return cb('redis exited with code '+ code);
    }
    return cb('redis exited with signal '+ signal);
  });

  var that = {
    stop: function() {
      if(stopping) {
        console.error('already stopping');
        return;
      }
      stopping = true;
      p.kill();
    }
  };

  carrier.carry(p.stdout).on('line', function(l) {
    if(started) {
      return;
    }
    if(ready.test(l)) {
      started = true;
      return cb(null, that);
    }
  });
  carrier.carry(p.stderr).on('line', function(l) {
    console.error('redis!', l);
  });
};

