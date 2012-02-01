#!/usr/bin/env node

/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var redis  = require('redis');


var queueName = process.argv[2];
console.log('managing', queueName);
var m = new Manager(queueName);
m.go();
