var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    npmlog 	= require('npmlog'),
    nopt 	= require('nopt'),
    ipkg 		= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    help 		= require('./../lib/helpFormat'),
	novacom 	= require('./../lib/novacom'),
	deviceTools	= require('./../lib/setup-device');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error('uncaughtException', err.toString());
	cliControl.end();
});

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"inspect":	Boolean,
	"device-list":	Boolean,
	"close":	Boolean,
	"hosted":	Boolean,
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
	cliControl.end();
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
	deviceTools.showDeviceListAndExit();
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

if (argv.argv.remain.length > 1) {
	return finish("Please check arguments");
}
var appId = argv.argv.remain[0];

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
		help.format(" PARAMS can be one of the following forms"),
		help.format("win32",            "\t (e.g.) -p \"{'key1':'value2', 'key2':'value2 containing space'}\""),
		help.format(["linux","darwin"], "\t (e.g.) -p '{\"key1\":\"value2\", \"key2\":\"value2 containing space\"}'"),
		help.format("\t (e.g.) -p \"key1=value2\" -p \"key2=value2 containing space\""),
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

	help.print(helpString);
}

function launch() {
	var pkgId = appId;
	params = getParams();
	log.info("launch():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		cliControl.end();
	}
	ipkg.launcher.launch(options, pkgId, params, finish);
}

function launchHostedApp() {
	var hostedurl = fs.realpathSync(appId);
	var pkgId = "com.sdk.ares.hostedapp";
	options.hostedurl = hostedurl;
	params = getParams();
	log.info("launch():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		cliControl.end();
	}
	ipkg.launcher.launch(options, pkgId, params, finish);
}

function getParams() {
	var params = {};
	if (argv.params) {
		argv.params.forEach(function(strParam) {
			var jsonFromArgv = strParam;
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
		//FIXME: this is temporary implementation. need to verify more.
		var refnStr = str;
		var reg = /^['|"](.)*['|"]$/;
		if (reg.test(refnStr)) {
			refnStr = refnStr.substring(1, str.length-1);
		}
		reg = /^{(.)*}$/;
		if (!reg.test(refnStr)) {
			//is not JSON string
			return str;
		}
		if (refnStr.indexOf("\"") === -1) {
			return refnStr.replace(/\s*"/g, "")
	 				.replace(/\s*'/g, "")
	 				.replace("{", "{\"")
	 				.replace("}","\"}")
	 				.replace(/\s*,\s*/g, "\",\"")
	 				.replace(/\s*:\s*/g, "\":\"");
		} else {
			return refnStr.replace(/\s*'/g, "\"");
		}
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
	var pkgId = appId;
	log.info("close():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		cliControl.end();
	}
	ipkg.launcher.close(options, pkgId, params, finish);
}

function running() {
	ipkg.launcher.listRunningApp(options, null, function(err, runningApps) {
		var strRunApps = "";
		var cnt = 0;
		if (runningApps instanceof Array) runningApps.forEach(function (runApp) {
			if (cnt++ !== 0) strRunApps = strRunApps.concat('\n');
			strRunApps = strRunApps.concat(runApp.id);
		});
		console.log(strRunApps);
		finish(err);
	});
}

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		log.error(processName + ": "+ err.toString());
		log.verbose(err.stack);
	} else {
		if (value && value.msg) {
			console.log(value.msg);
		}
	}
	cliControl.end();
}

function insertParams(params, keyPair) {
	var values = keyPair.split('=');
	if (values.length != 2) {
		return;
	}
	params[values[0]] = values[1];
	log.info("Inserting params " + values[0] + " = " + values[1]);
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
