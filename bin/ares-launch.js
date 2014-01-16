#!/usr/bin/env node

var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    sprintf = require('sprintf').sprintf,
    npmlog 	= require('npmlog'),
    nopt 	= require('nopt'),
    ipkg 		= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
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
	"inspect":	Boolean,
	"device-list":	Boolean,
	"close":	String,
	"running":	Boolean,
	"params":   [String, Array],
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"i": ["--inspect"],
	"D": ["--device-list"],
	"c": ["--close"],
	"r": ["--running"],
	"p": ["--params"],
	"V": ["--version"],
	"h": ["--help"],
	"H": ["--hosted"],
	"v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

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

var installMode = "Installed";
var hostedurl = "";
var params = {};

if(argv.hosted){
	installMode = "Hosted";
}

var op;
if (argv.close) {
	op = close;
} else if (argv.running) {
	op = running;
} else if (argv['device-list']) {
	op = deviceList;
} else if (argv['version']) {
	versionTool.showVersionAndExit();
} else if (argv.hosted){
	op = launchHostedApp;
} else {
	op = launch;
}



var options = {
	device: argv.device,
	inspect: argv.inspect,
	installMode: installMode,
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
		help.format(processName + " - Runs and terminates applications"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] <APP_ID>"),
		"",
		help.format(processName + " [OPTION...] -H, --hosted <APP_DIR>"), /* TBD */
		"",
		"OPTION",
		help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
		help.format("-D, --device-list", "List the available DEVICEs"),
		help.format("-c, --close", "Terminate appication on device"),
		help.format("-r, --running", "List the running applications on device"),
		help.format("-i, --inspect", "launch application with a web inspector"),
		help.format("-p, --params <PARAMS>", "PARAMS is used on boot application-launching"),
		help.format("\t PARAMS (e.g.) -p '{\"key1\":\"value2\", \"key2\":\"value2 containing space\"}'"),
		"",
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
		help.format("To launch an app on the TARGET DEVICE, user have to specify"),
		help.format("the TARGET DEVICE using '--device, -d' option"),
		"",
		help.format("PARAMS defines parameters to be used on boot app lauching."),
		help.format("PARAMS can be specified as key-value pairs of the form \"key=value\""),
		help.format("or as JSON objects of the form '{\"key1\":\"value1\", \"key2\":\"value2\", ...}'."),
		help.format("Surrounding quotes are required in both cases."),
		"",
		help.format("Hosted app does not need packaging/installing."),
		help.format("Hosted app means providing app via a local server based on <APP_DIR>,"),
		help.format("user just needs to specify <APP_DIR> path"),
		help.format("to run APP as a hosted app without packaging, installing."),
		help.format("If user wants to close Hosted app, please use com.sdk.ares.hostedapp as a <APP_ID>."),
		"",
		help.format("APP_ID is an application id described in appinfo.json"),
		""
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
}

function launch() {
	var pkgId = argv.argv.remain.splice(0,1).join("");
	params = getParams();
	log.info("launch():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.launch(options, pkgId, params, finish);
}

function launchHostedApp() {
	var hostedurl = fs.realpathSync(argv.argv.remain.splice(0,1).join(""));
	var pkgId = "com.sdk.ares.hostedapp";
	options.hostedurl = hostedurl;
	params = getParams();
	log.info("launch():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.launch(options, pkgId, params, finish);
}

function getParams() {
	var params = {};
	if (argv.params) {
		argv.params.forEach(function(strParam) {
			var jsonFromArgv = strParam + argv.argv.remain.join("");
			jsonFromArgv = refineJsonString(jsonFromArgv);
			if (isJson(jsonFromArgv)) {
				params = JSON.parse(jsonFromArgv);
			} else {
				insertParams(params, strParam);
			}
		});
	}
	return params;
}

function refineJsonString(str) {
		var refnStr = str;
		var reg = /^['|"](.)*['|"]$/;
		if (reg.test(refnStr)) {
			refnStr = refnStr.substring(1, str.length);
		}
		reg = /^{(.)*}$/;
		if (!reg.test(refnStr)) {
			//is not JSON string
			return str;
		}
		return refnStr.replace(/\s*'/g, "\"");
}

function isJson(str) {
	try {
		JSON.parse(str);
	} catch(err) {
		return false;
	}
	return true;
}

function close() {
	var pkgId = (argv.close === 'true')? argv.argv.remain[0] : argv.close;
	log.info("close():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.launcher.close(options, pkgId, params, finish);
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
	}
}

function insertParams(params, keyPair) {
	var values = keyPair.split('=');
	params[values[0]] = values[1];
	log.info("Inserting params " + values[0] + " = " + values[1]);
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
