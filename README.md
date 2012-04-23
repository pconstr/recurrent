recurrent
=========

a redis-backed manager of recurrent jobs, for [node.js](http://nodejs.org)

(immature, with minimal testing and probably nasty bugs)

features
--------

* multiple queues, backed up by redis
* failed job runs are repeated until they succeed or give up
* job retries don't pile up with repetitions
* the job implementation determines at the end of each run when (and whether) to repeat
* as many worker processes as you want spread over multiple cores and machines - but you have to start them

caveats
-------

* single point of failure in queue manager, and redis itself - you need to make sure both stay up / restart quickly and there's exactly 1 instance of each running

installing
----------

`npm install recurrent`

running the manager
-------------------

make sure redis is running and then:

<pre>
var recurrent = require('recurrent');

// will manage a queue called q and serve a web UI on port 7654

var m = new recurrent.Manager('q', 7654);
</pre>


browse to `localhost:9999/7654`

starting a recurrent job
------------------------

<pre>
var recurrent = require('recurrent');

// starts a job which will run for the first time in about 30s

var c = new recurrent.Client('q');
c.add('t1', new Date().getTime() + 30000, function(err) {
  ...
});


recurrent jobs workers
----------------------

<pre>
var recurrent = require('recurrent');

var w = new recurrent.Worker('q');

w.do = function(taskId, cb) {
  // do nothing for 600s
  setTimeout(function() {
    console.error('completed', taskId);

    // follow up in about 5s
    cb(null, new Date().getTime()+ 5000);
  }, 600);
};

</pre>
