#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    ipkg = require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools');
    

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"app":	[String, null],
	"service":	[String, null],
	"browser":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"a": ["--app"],
	"s": ["--service"],
	"b": ["--browser"],
	"V": ["--version"],
	"h": ["--help"],
	"v": ["--level", "verbose"]
};

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-inspect.js'*/);

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


/**********************************************************************/

if (argv.help) {
	help();
	process.exit(0);
}

log.verbose("argv", argv);

var op;

if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = inspect;
}

var options = {
	device: argv.device,
	appId: argv.app,
	serviceId: argv.service,
	browser: argv.browser
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
			"\t" + processName + " [OPTIONS] --app|-a <APP_ID>\n" +
			"\t" + processName + " [OPTIONS] --service|-s <SERVICE_ID>\n" +
			"\t" + processName + " [OPTIONS] --browser|-b\n" +
			"\t" + processName + " [OPTIONS] --version|-V\n" +
			"\t" + processName + " [OPTIONS] --help|-h\n" +
			"\n" +
			"OPTIONS:\n" +
			"\t--device|-d: device name to connect to default]\n" +
			"\t--level: tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]\n");
}

function inspect(){
	log.info("inspect():", "AppId:", options.appId);
	if(!options.appId){
		help();
		process.exit(1);
	}
	ipkg.inspector.inspect(options, null, finish);
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
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});