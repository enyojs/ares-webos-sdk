#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    ipkg = require('./../lib/ipkg-tools'),
    npmlog = require('npmlog'),
    versionTool = require('./../lib/version-tools'),
    nopt = require('nopt');

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"inspect":	Boolean,
	"device-list":	Boolean,
	"close":	Boolean,
	"relaunch":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"I": ["--inspect"],
	"f": ["--relaunch"],
	"c": ["--close"],
	"l": ["--list"],
	"V": ["--version"],
	"h": ["--help"],
	"v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error('uncaughtException', err.toString());
	process.exit(1);
});

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';
ipkg.launcher.log.level = log.level;

/**********************************************************************/

if (argv.help) {
	help();
	process.exit(0);
}

log.verbose("argv", argv);

var op;
if (argv.close) {
	op = close;
} else if (argv.relaunch) {
	throw new Error('Not implemented');
} else if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = launch;
}

var options = {
	device: argv.device,
	inspect: argv.inspect
};

/**********************************************************************/

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

function help() {
	console.log("\n" +
			"USAGE:\n" +
			"\t" + processName + " [OPTIONS] <APP_ID>\n" +
			"\t" + processName + " [OPTIONS] --close <APP_ID>\n" +
			"\t" + processName + " [OPTIONS] --relaunch <APP_ID>\n" +
			"\t" + processName + " [OPTIONS] --version|-V\n" +
			"\t" + processName + " [OPTIONS] --help|-h\n" +
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
