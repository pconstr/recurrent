#!/usr/bin/env node


/* Copyright 2011 Carlos Guerreiro
   All rights reserved */

'use strict';

var recurrent = require('../recurrent.js');

var m = new recurrent.Manager('q', 6789);

m.go();
