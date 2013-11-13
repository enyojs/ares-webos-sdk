#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    async 	= require('async'),
    sprintf = require('sprintf').sprintf,
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    ipkg = require('./../lib/ipkg-tools'),
    console = require('./../lib/consoleSync'),
    versionTool = require('./../lib/version-tools'),
    help 		= require('./../lib/helpFormat'),
    novacom 	= require('./../lib/novacom');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error('uncaughtException', err.toString());
	process.exit(1);
});

if (process.env['ARES_BUNDLE_BROWSER'] && !argv['bundledbrowser']) {
	delete process.env['ARES_BUNDLE_BROWSER'];
}

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"app":	[String, null],
	"service":	[String, Array],
	"browser":	Boolean,
	"bundledbrowser": Boolean,
	"device-list":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"a": ["--app"],
	"s": ["--service"],
	"b": ["--browser"],
	"B": ["--bundledbrowser"],
	"D": ["--device-list"],
	"V": ["--version"],
	"h": ["--help"],
	"v": ["--level", "verbose"]
};

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-inspect.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';


/**********************************************************************/

if (argv.help) {
	showUsage();
	process.exit(0);
}

log.verbose("argv", argv);

var op;

if (argv['version']) {
	versionTool.showVersionAndExit();
} else if (argv['device-list']) {
	op = deviceList;
} else {
	op = inspect;
}

var options = {
	device: argv.device,
	appId: argv.app,
	serviceId: argv.service,
	browser: argv.browser,
	bundledBrowser: argv.bundledbrowser
};

/**********************************************************************/

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

function showUsage() {
	var helpString = [
		"",
		"NAME",
		help.format(processName + " - Provides the debugging Web/Node Inspector"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] -a, --app=<APP_ID>"),
		help.format(processName + " [OPTION...] -s, --service=<SERVICE_ID>"),
//		help.format(processName + " [OPTIONS]|[COMMAND] --browser, -b"), * TBD *
		"",
		"OPTION",
		help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
		help.format("-D, --device-list", "List the available DEVICEs"),
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
//		help.format("Launch web inspector for <APP_ID> or launch node inspector for <SERVICE_ID> or launch web inspector for web browser"), * TBD *
		help.format("Launch web inspector for APP_ID or launch node inspector for SERVICE_ID"),
		help.format("This command does not launch an app."),
		help.format("So, an App should be running on the TARGET DEVICE"),
		"",
		help.format("APP_ID is an application id decribed in appinfo.json"),
		help.format("SERVICE_ID is an service id decribed in services.json"),
//		"",
//		help.format("--bundledbrowser|-B"),
//		help.format("\t Open web or node inspector on the bundled browser"),
//		help.format("\t (Note) Only jenkins output or installer version of ares have a bundled browser"),
		""
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
}

function inspect(){
	log.info("inspect():", "AppId:", options.appId, "ServiceId:", options.serviceId);
	if(!options.appId && !options.serviceId){
		showUsage();
		process.exit(1);
	}
	ipkg.inspector.inspect(options, null, finish);
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
		console.log(processName + ": " + err.toString());
		process.exit(1);
	} else {
		if (value && value.msg) {
			console.log(value.msg);
		}
		process.exit(0);
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
