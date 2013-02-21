#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    ipkg = require('nodejs-module-webos-ipkg'),
    npmlog = require('npmlog'),
    nopt = require('nopt');

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"device-list":	Boolean,
	"list":		Boolean,
	"install":	path,
	"remove":	String,
	"version":	Boolean,
	"help":		Boolean,
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"i": ["--install"],
	"r": ["--remove"],
	"l": ["--list"],
	"-D": ["--device-list"],
	"-V": ["--version"],
	"-h": ["--help"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

if (argv.help) {
	help();
	process.exit(0);
}

/**********************************************************************/

var log = npmlog;
log.heading = 'ares-install';
log.level = argv.level || 'warn';
ipkg.installer.log.level = log.level;

/**********************************************************************/

log.verbose("argv", argv);

var op;
if (argv.list) {
	op = list;
} else if (argv.list) {
	op = list;
} else if (argv.install) {
	op = install;
} else if (argv.remove) {
	op = remove;
} else if (argv['device-list']) {
	throw new Error('Not implemented');
} else if (argv['version']) {
	throw new Error('Not implemented');
} else {
	op = install;
}

var options = {
	device: argv.device
};

/**********************************************************************/

op(finish);

function help() {
	console.log("\n" +
		    "USAGE:\n" + 
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] <PACKAGE_FILE>\n" +
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] --remove <PACKAGE_ID>\n" +
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] --list|-l\n" +
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] --device-list|-D\n" +
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] --version|-V\n" +
		    "\t" + process.argv[0] + " " + process.argv[1]  + " [OPTIONS] --help|-h\n" +
		    "\n" +
		    "OPTIONS:\n" +
		    "\t--device|-d: device name to connect to default]\n" +
		    "\t--level: tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]\n");
}

function install() {
	var pkgPath = argv.install || argv.argv.remain[0];
	log.info("install():", "pkgPath:", pkgPath);
	if (!pkgPath) {
		help();
		process.exit(1);
	}
	ipkg.installer.install(options, pkgPath, finish);
}

function list() {
	ipkg.installer.list(options, function(err, pkgs) {
		pkgs.forEach(function (pkg) {
			process.stdout.write(pkg.id + '\n');
		});
		finish(err);
	});
}

function remove() {
	var pkgId = argv.remove;
	log.info("remove():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.installer.remove(options, pkgId, finish);
}

function finish(err, value) {
	if (err) {
		log.error('finish():', err);
		process.exit(1);
	} else {
		log.info('finish():', value);
		process.exit(0);
	}
}