var fs = require('fs'),
    path = require("path"),
    async 	= require('async'),
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    ipkg = require('./../lib/ipkg-tools'),
    cliControl 	= require('./../lib/cli-control'),
    versionTool = require('./../lib/version-tools'),
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
	"port":	[String, null],
	"close":	Boolean,
	"app":	[String, null],
	"service":	[String, null],
	"device-list":	Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"p": ["--port"],
	"c": ["--close"],
	"a": ["--app"],
	"s": ["--service"],
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
	cliControl.end();
}

log.verbose("argv", argv);

var op;

if (argv['version']) {
	versionTool.showVersionAndExit();
} else if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else if (argv['close']) {
	op = close;
} else {
	op = gdbserver;
}

var options = {
	device: argv.device,
	appId: argv.app || argv.argv.remain[0],
	serviceId: argv.service,
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
		help.format(processName + " [OPTION...] [-a, --app] <APP_ID>"),
		help.format(processName + " [OPTION...] -s, --service <SERVICE_ID>"),
		"",
		"OPTION",
		help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
		help.format("-D, --device-list", "List the available DEVICEs"),
		help.format("-c, --close", "close running gdbserver"),
		help.format("-p, --port", "gdbserver port to be used on device [default:9930]"),
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
		help.format("Launch native app with gdbserver"),
		help.format("(Notice) A native app should have been installed first."),
		"",
		help.format("APP_ID is an application id described in appinfo.json"),
		"",
		"Examples:",
		" Launch a native app with gdbserver (port: 9932) in the device",
		processName + "com.native.app -p 9932 -d emulator",
		"",
		" Launch a native service with gdbserver (port: 9932) in the device",
		processName + "-s com.native.app.service -p 9932 -d emulator",
		"",
		" This command displays the address gdbserver runs like the following",
		" >> gdb can connect to [target remote 10.123.123.123:9930] ",
		"",
		" This means gdb can connect to the gdbserver remotely",
		" > (gdb) file NATIVE_BIN",
		" > (gdb) set sysroot remote:/",
		" > (gdb) target remote 10.123.123.123:9930",
		" > (gdb) c",
		""
	];

	help.print(helpString);
}

function gdbserver(){
	log.info("gdbserver():", "AppId:", options.appId);
	if(!options.appId && !options.serviceId){
		showUsage();
		cliControl.end();
	}
	ipkg.gdbserver.run(options, null, finish);
}

function close(){
	log.info("gdbserver():", "close");
	if(!options.device){
		showUsage();
		cliControl.end();
	}
	ipkg.gdbserver.close(options, null, finish);
}

function finish(err, value) {
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

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
