#!/usr/bin/env node

var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    npmlog 	= require('npmlog'),
    sprintf = require('sprintf').sprintf,
    nopt 	= require('nopt'),
    ipkg 		= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    help 		= require('./../lib/helpFormat'),
	novacom 	= require('./../lib/novacom');

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
	showUsage();
	process.exit(0);
}

log.verbose("argv", argv);

var op;
if (argv.list) {
	op = list;
} else if (argv.install) {
	op = install;
} else if (argv.remove) {
	op = remove;
} else if (argv['device-list']) {
	op = deviceList;
} else if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = install;
}

var options = {
	appId: 'com.ares.defaultName',
	device: argv.device
};

/**********************************************************************/

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

function showUsage() {
	var helpString = [
			"USAGE:",
			help.format(processName + " [OPTIONS] <PACKAGE_FILE>", "Install .ipk package into TARGET DEVICE"),
			help.format(processName + " [OPTIONS] --remove, -r <APP_ID>", "Remove an installed app having <APP_ID>"),
			help.format(processName + " [OPTIONS] --list, -l", "List installed apps"),
			help.format(processName + " [OPTIONS] --help, -h", "Display this help"),
			help.format(processName + " [OPTIONS] --version, -V", "Display version info"),
			help.format(processName + " [OPTIONS] --device-list, -D", "List TARGET DEVICEs"),
			"",
			"OPTIONS:",
			help.format("--device, -d", "device name to connect"),
			help.format("--level, -l", "tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
			"",
			"APP_ID is an application id decribed in appinfo.json",
			"",
			"To install .ipk package into TARGET DEVICE, user have to specify the TARGET DEVICE using '--device, -d' option",
			""
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
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
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			strPkgs = strPkgs.concat(pkg.id).concat('\n');
		});
		process.stdout.write(strPkgs);
		finish(err);
	});
}

function remove() {
	var pkgId = (argv.remove === 'true')? argv.argv.remain[0] : argv.remove;
	log.info("remove():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.installer.remove(options, pkgId, finish);
}

function deviceList() {
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.list.bind(resolver),
		function(devices, next) {
			log.info("list()", "devices:", devices);
			if (Array.isArray(devices)) {
				console.log(sprintf("%-16s %-16s %-24s %s", "<DEVICE NAME>", "<PLATFORM>", "<DESCRIPTION>", "<SSH ADDRESS>"));
				devices.forEach(function(device) {
					console.log(sprintf("%-16s %-16s %-24s (%s)", device.name, device.type, device.description, device.addr));
				});
			}
			log.info("list()", "Success");
			next();
		}
	], finish);
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
