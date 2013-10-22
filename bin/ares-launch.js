#!/usr/bin/env node

var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    sprintf = require('sprintf').sprintf,
    ipkg 	= require('./../lib/ipkg-tools'),
    npmlog 	= require('npmlog'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    help 	= require('./../lib/helpFormat'),
	novacom = require('./../lib/novacom'),
    nopt 	= require('nopt');

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"inspect":	Boolean,
	"device-list":	Boolean,
	"close":	String,
	"running":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"I": ["--inspect"],
	"c": ["--close"],
	"r": ["--running"],
	"D": ["--device-list"],
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
	showUsage();
	process.exit(0);
}

log.verbose("argv", argv);

var op;
if (argv.close) {
	op = close;
} else if (argv.running) {
	op = running;
} else if (argv['device-list']) {
	op = deviceList;
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
	var self = this;
	versionTool.checkNodeVersion(function(err) {
		op.bind(self, finish);
	});
}

function showUsage() {
	var helpString = [
			"USAGE:",
			help.format(processName + " [OPTIONS] <APP_ID>", "Launch an app having <APP_ID> on the TARGET DEVICE"),
			help.format(processName + " [OPTIONS] --close, -c <APP_ID>", "Close an app having <APP_ID>"),
			help.format(processName + " [OPTIONS] --running, -r <APP_ID>", "List running apps"),
			help.format(processName + " [OPTIONS] --help, -h", "Display this help"),
			help.format(processName + " [OPTIONS] --version, -V", "Display version info"),
			help.format(processName + " [OPTIONS] --device-list, -D", "List TARGET DEVICEs"),
			"",
			"OPTIONS:",
			help.format("--device, -d", "device name to connect"),
			help.format("--inspect, -i", "launch app with a web inspector"),
			help.format("--level, -l", "tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
			"",
			"APP_ID is an application id decribed in appinfo.json",
			"",
			"To launch an app on the TARGET DEVICE, user have to specify the TARGET DEVICE using '--device, -d' option",
			""
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
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
	console.log("[ByJunil]")
	var pkgId = (argv.close === 'true')? argv.argv.remain[0] : argv.close;
	log.info("close():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.close(options, pkgId, null, finish);
}

function running() {
	ipkg.launcher.listRunningApp(options, null, function(err, runningApps) {
		var strRunApps = "";
		if (runningApps instanceof Array) runningApps.forEach(function (runApp) {
			strRunApps = strRunApps.concat(runApp.id).concat('\n');
		});
		console.log(strRunApps);
		finish(err);
	});
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

function finish(err, value) {
	if (err) {
		log.error('finish():', err);
		console.log(processName + ": "+ err.toString());
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
