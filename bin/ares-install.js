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
	"device-list":	Boolean,
	"list":		Boolean,
	"install":	path,
	"remove":	String,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"i": ["--install"],
	"r": ["--remove"],
	"l": ["--list"],
	"D": ["--device-list"],
	"V": ["--version"],
	"h": ["--help"],
	"v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';
ipkg.installer.log.level = log.level;

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error('uncaughtException', err.toString());
	log.info('uncaughtException', err.stack);
	process.exit(1);
});

/**********************************************************************/

if (argv.help) {
	help();
	process.exit(0);
}

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
	versionTool.showVersionAndExit();
} else {
	op = install;
}

var options = {
	appId: 'com.lge.ares.defaultName',
	device: argv.device
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
			"\t" + processName + " [OPTIONS] <PACKAGE_FILE>\n" +
			"\t" + processName + " [OPTIONS] --remove <PACKAGE_ID>\n" +
			"\t" + processName + " [OPTIONS] --list|-l\n" +
			"\t" + processName + " [OPTIONS] --device-list|-D\n" +
			"\t" + processName + " [OPTIONS] --version|-V\n" +
			"\t" + processName + " [OPTIONS] --help|-h\n" +
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
		var strPkgs = "";
		if (pkgs) pkgs.forEach(function (pkg) {
			strPkgs = strPkgs.concat(pkg.id).concat('\n');
		});
		process.stdout.write(strPkgs);
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

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		console.log(processName + ": "+ err.toString());
		process.exit(1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		process.exit(0);
	}
}
