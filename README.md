recurrent
=========

A [redis](http://redis.io)-backed manager of recurrent jobs, for [node.js](http://nodejs.org).

(immature, with minimal testing and probably nasty bugs)

Features
--------

* multiple queues, backed up by redis
* tasks have a permanent unique id and mutable associated data
* failed job runs are retried until they succeed or give up, with exponential back-off
* job retries and repetitions don't pile up
* the worker's job implementation determines at the end of each run when (and whether) to repeat
* as many worker processes as you want spread over multiple cores and machines - but you have to start them

Caveats
-------

* single point of failure in queue manager (as well as redis itself) - you need to make sure it stays up / restarts quickly and there's exactly 1 instance

Installing
----------

`npm install recurrent`

Running the manager
-------------------

Make sure redis is running and then:

<pre>
var recurrent = require('recurrent');

// will manage a queue q

var m = new recurrent.Manager('q').connect();
# pass arguments for redis.createClient() to connect()

</pre>

`recurrent` offers a (currently very incomplete) web UI:

<pre>
http.createServer(m.webUI).listen(7654);
</pre>

And then browse to `localhost:7654`

When the manager is not needed anymore:

<pre>
m.stop()
</pre>

Starting a recurrent job
------------------------

<pre>
var recurrent = require('recurrent');

// starts a job which will run for the first time in about 30s

var c = new recurrent.Client('q').connect();
# pass arguments for redis.createClient() to connect()

c.add('t1', new Date().getTime() + 30000, {my: 'data'}, function(err) {
  ...
});
</pre>

Adding again the same `taskId` will reset execution time.

When the client is not needed any more:

<pre>
c.stop();
</pre>

Recurrent job workers
---------------------

<pre>
var recurrent = require('recurrent');

function doWork(task, cb) {
  // do nothing for 600s
  console.log('got', task.id, 'with this data: ', task.data);
  setTimeout(function () {
    console.error('completed', task.id);

    // do again in about 5s
    cb(null, new Date().getTime()+ 5000);
  }, 600);
}

var w = new recurrent.Worker('q', doWork).connect();
# pass arguments for redis.createClient to connect()

</pre>

When the job worker is not needed any more:

<pre>
w.stop();
</pre>


Task failure
------------

Workers must not throw.

To signal failure a worker calls back with error.
It can specify a retry time:

<pre>
cb('something went wrong', new Date().getTime()+ 1000); // retry in 1s
</pre>

Or let `recurrent` do exponential back-off

<pre>
cb('something went wrong');
</pre>

Exponential back-off can be configured per worker:

<pre>
var w = new recurrent.Worker('q', doWork, {
  minBackOff: 500, //  start backing off at 500 ms
  maxBackOff:5000, // max back-off of 5 s
  backOffMultiplier:1.5 // back-off 50% longer every time
}).connect();
</pre>

When a task is being retried after failure `task.retries` contains how many retries have been attempted (including the current one).
It will `undefined` for the first execution, `1` for the first retry and so on.
