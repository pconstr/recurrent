recurrent
=========

a redis-backed manager of recurrent jobs, for [node.js](http://nodejs.org)

(immature, with minimal testing and probably nasty bugs)

features
--------

* multiple queues, backed up by redis
* failed job runs are retried until they succeed or give up
* job retries and repetitions don't pile up
* the worker's job implementation determines at the end of each run when (and whether) to repeat
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


browse to `localhost:7654` (very incomplete)

when the manager is not needed anymore:

<pre>
m.stop()
</pre>

starting a recurrent job
------------------------

<pre>
var recurrent = require('recurrent');

// starts a job which will run for the first time in about 30s

var c = new recurrent.Client('q');
c.add('t1', new Date().getTime() + 30000, function(err) {
  ...
});
</pre>

when the client is not needed any more:

<pre>
c.stop();
</pre>

recurrent jobs workers
----------------------

<pre>
var recurrent = require('recurrent');

function doWork(taskId, cb) {
  // do nothing for 600s
  setTimeout(function () {
    console.error('completed', taskId);

    // do again in about 5s
    cb(null, new Date().getTime()+ 5000);
  }, 600);
}

var w = new recurrent.Worker('q', doWork);
</pre>

when the job worker is not needed any more:

<pre>
w.stop();
</pre>
