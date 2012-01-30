recurrent
=========

a redis-backed manager of recurrent jobs, for [node.js](http://nodejs.org)

(immature, with very minimal testing and probably nasty bugs)

features
--------

* multiple queues, backed up by redis
* failed job runs are repeated until they succeed or give up
* job retries don't pile up with repetitions
* the job implementation determines at the end of each run when (and whether) to repeat

installing
----------

`npm install recurrent`

running the manager
-------------------

make sure redis is running and then:

`./recurrentManager.js`

browse to `localhost:9999/q` to see the status of queue `q`

starting a recurrent job
------------------------

<pre>
var recurrent = require('recurrent');

// starts a job which will run for the first time in about 30s

var q = new recurrent.Client('q');
q.add('t1', new Date().getTime() + 30000, function(err) {
  ...
});


working recurrent jobs
----------------------

<pre>
var recurrent = require('recurrent');

var q = new recurrent.Worker('q');

q.do = function(taskId, cb) {
  // do nothing for 600s
  setTimeout(function() {
    console.error('completed', taskId);

    // follow up in about 5s
    cb(null, new Date().getTime()+ 5000);
  }, 600);
};

q.go();

</pre>


limitations
------------

`recurrentManager.js` is a single point of failure in addition to redis itself, exactly 1 instance of each needs to be running
