#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    ipkg = require('./ipkg-tools'),
    npmlog = require('npmlog'),
    nopt = require('nopt');

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"device-list":	Boolean,
	"close":	Boolean,
	"relaunch":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"f": ["--relaunch"],
	"c": ["--close"],
	"l": ["--list"],
	"-V": ["--version"],
	"-h": ["--help"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

if (argv.help) {
	help();
	process.exit(0);
}

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';
ipkg.launcher.log.level = log.level;

/**********************************************************************/

log.verbose("argv", argv);

var op;
if (argv.close) {
	op = close;
	throw new Error('Not implemented');
} else if (argv.relaunch) {
	op = relaunch;
	throw new Error('Not implemented');
} else if (argv['device-list']) {
	throw new Error('Not implemented');
} else if (argv['version']) {
	throw new Error('Not implemented');
} else {
	op = launch;
}

var options = {
	device: argv.device
};

/**********************************************************************/

op(finish);

function help() {
	console.log("\n" +
			"USAGE:\n" +
			"\t" + log.heading + " [OPTIONS] <APP_ID>\n" +
			"\t" + log.heading + " [OPTIONS] --close <APP_ID>\n" +
			"\t" + log.heading + " [OPTIONS] --relaunch <APP_ID>\n" +
			"\t" + log.heading + " [OPTIONS] --version|-V\n" +
			"\t" + log.heading + " [OPTIONS] --help|-h\n" +
			"\n" +
			"OPTIONS:\n" +
			"\t--device|-d: device name to connect to default]\n" +
			"\t--level: tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]\n");
}

function launch() {
	var pkgId = argv.argv.remain[0];
	log.info("launch():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.launch(options, pkgId, null, finish);
}

function close() {
	var pkgId = argv.argv.remain[0];
	log.info("close():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.close(options, pkgId, null, finish);
}

function finish(err, value) {
	if (err) {
		log.error('finish():', err);
		console.log(err);
		process.exit(1);
	} else {
		if (value && value.msg) {
			console.log(value.msg);
		}
		process.exit(0);
	}}


process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});