var fs = require('fs'),
    path = require("path"),
    async 	= require('async'),
    log = require('npmlog'),
    nopt = require('nopt'),
    ipkg = require('./../lib/ipkg-tools'),
    cliControl 	= require('./../lib/cli-control'),
    versionTool = require('./../lib/version-tools'),
    help 		= require('./../lib/helpFormat'),
    novacom 	= require('./../lib/novacom'),
    deviceTools	= require('./../lib/setup-device');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"app":	[String, null],
	"service":	[String, Array],
	"browser":	Boolean,
	"device-list":	Boolean,
	"open":	Boolean,
	"host-port": [String, null],
	"version":	Boolean,
	"help":		Boolean,
	"hidden-help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"a": ["--app"],
	"s": ["--service"],
	"b": ["--browser"],
	"D": ["--device-list"],
	"o": ["--open"],
	"P": ["--host-port"],
	"D": ["--device-list"],
	"V": ["--version"],
	"h": ["--help"],
	"hh": ["--hidden-help"],
	"v": ["--level", "verbose"]
};

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-inspect.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';


/**********************************************************************/

process.on('uncaughtException', function (err) {
	log.error('uncaughtException', err.toString());
	cliControl.end(-1);
});

if (argv.help || argv['hidden-help']) {
	showUsage(argv['hidden-help']);
	cliControl.end();
}

log.verbose("argv", argv);

var op;

if (argv['version']) {
	versionTool.showVersionAndExit();
} else if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else {
	op = inspect;
}

var options = {
	device: argv.device,
	appId: argv.app || argv.argv.remain[0],
	serviceId: argv.service,
	browser: argv.browser,
	open: argv.open,
	hostPort: argv["host-port"]
};

/**********************************************************************/

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

function showUsage(hiddenFlag) {
	var helpString = [
		"",
		"NAME",
		help.format(processName + " - Provides the debugging Web/Node Inspector"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] [-a, --app] <APP_ID>"),
		help.format(processName + " [OPTION...] -s, --service <SERVICE_ID>"),
//		help.format(processName + " [OPTIONS]|[COMMAND] --browser, -b"), * TBD *
		"",
		"OPTION",
		help.format("-o, --open", "Open url with a web browser"),
		help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
		help.format("-D, --device-list", "List the available DEVICEs"),
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
//		help.format("Launch web inspector for <APP_ID> or launch node inspector for <SERVICE_ID> or launch web inspector for web browser"), * TBD *
		help.format("Launch web inspector for APP_ID or launch node inspector for SERVICE_ID"),
		help.format("This command does not launch app."),
		help.format("So, app should be running on the TARGET DEVICE"),
		"",
		help.format("APP_ID is an application id described in appinfo.json"),
		help.format("SERVICE_ID is a service id described in services.json"),
		""
	];

	var hiddenhelpString = [
		"",
		"EXTRA-OPTION",
		help.format("-P, --host-port", "Set Host PC's port for remote web/node inspector"),
		"",
		"EXAMPLES",
		"",
		"# Set the host-pc's port (2043) to connect to the remote web inspector",
		processName+" com.yourdomain.app -d DEVICE -P 2043",
		"# If -P options is not used, a random port will be assigned",
		processName+" com.yourdomain.app -d DEVICE",
		""
	];

	help.print(helpString);
	if (hiddenFlag) {
		help.print(hiddenhelpString);
	}
}

function inspect(){
	log.info("inspect():", "AppId:", options.appId, "ServiceId:", options.serviceId);
	if(!options.appId && !options.serviceId){
		showUsage();
		cliControl.end(-1);
	}
	ipkg.inspector.inspect(options, null, finish);
}

function finish(err, value) {
	if (err) {
		log.error(processName + ": " + err.toString());
		log.verbose(err.stack);
		cliControl.end(-1);
	} else {
		if (value && value.msg) {
			console.log(value.msg);
		}
		cliControl.end();
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
