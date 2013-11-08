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

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"port":	[String, null],
	"close":	Boolean,
	"device-list":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"p": ["--port"],
	"c": ["--close"],
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
} else if (argv['close']) {
	op = close;
} else {
	op = gdbserver;
}

var options = {
	device: argv.device,
	appId: argv.argv.remain[0],
	port: argv.port
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
		help.format(processName + " - Command line interface for gdbserver"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTIONS] <APP_ID>"),
		help.format(processName + " [COMMAND]"),
		"",
		"DESCRIPTION",
		help.format("Launch native app with gdbserver"),
		help.format("(Notice) A native app should have been installed first."),
		"",
		help.format("APP_ID is an application id decribed in appinfo.json"),
		help.format("OPTIONS can be used overlapped, but COMMAND is used isolated."),
		"",
		"OPTIONS",
		help.format("--device, -d"),
		help.format("\t device name to connect"),
		"",
		help.format("--close, -c"),
		help.format("\t close running gdbserver"),
		"",
		help.format("--port, -p"),
		help.format("\t gdbserver port to use [default:9930]"),
		"",
		help.format("--level"),
		help.format("\t tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		"",
		help.format("-v"),
		help.format("\t tracing level 'verbose'"),
		"",
		"COMMAND",
		help.format("--help, -h"),
		help.format("\t Display this help"),
		"",
		help.format("--version, -V"),
		help.format("\t Display version info"),
		"",
		help.format("--device-list, -D"),
		help.format("\t List TARGET DEVICE"),
		""
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
}

function gdbserver(){
	log.info("gdbserver():", "AppId:", options.appId);
	if(!options.appId){
		showUsage();
		process.exit(1);
	}
	ipkg.gdbserver.run(options, null, finish);
}

function close(){
	log.info("gdbserver():", "close");
	if(!options.device){
		showUsage();
		process.exit(1);
	}
	ipkg.gdbserver.close(options, null, finish);
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
		console.log(processName + ": "+ err);
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
