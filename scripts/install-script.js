#!/usr/bin/env node

var npm = require('npm');
var log = require('npmlog');
var prefix = '>>>';

log.level = process.env.npm_config_loglevel;
log.silly(prefix, process.env);
// console.log(prefix, process.env);

// Use the loglevel specified by the user
var config = { loglevel: process.env.npm_config_loglevel};

// Go in the needed directory
process.chdir('node_modules/nodejs-module-webos-ipkg');

// Start executing the npm install
npm.load(config, function (err) {
	if (err) {
		log.error(prefix, "npm.load error: " + err);
		process.exit(1);
	}

	npm.commands.install([], function (err, data) {
		if (err) {
			log.error(prefix, "npm.install error: " + err);
			process.exit(1);
		}
		// command succeeded, and data might have some info
		log.silly(prefix, "DONE: >>" + data + "<<");
		process.exit(0);
	});
});

process.on('uncaughtException', function (err) {
	log.error(prefix, 'Caught exception: ' + err);
});