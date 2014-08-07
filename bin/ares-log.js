var fs  	= require('fs'),
    path 	= require("path"),
    npmlog 	= require('npmlog'),
    nopt 	= require('nopt'),
    async 	= require('async'),
	ipkg		= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    novacom 	= require('./../lib/novacom'),
    help 		= require('./../lib/helpFormat'),
	util 		= require('util'),
    deviceTools	= require('./../lib/setup-device');
    
/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	cliControl.end();
});

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

var knownOpts = {
	//generic options
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
	"version":	Boolean,
	// command-specific options
	"device-list":		Boolean,
	"list":		Boolean,
	"port":		[String, Array],
	"device":	[String, null],
	// no shortHands
	"run":		[String, null],
	"follow":	Boolean,
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"D": ["--device-list"],
	"l": ["--list"],
	"p": ["--port"],
	"f": ["--follow"],
	"d": ["--device"]
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Display application logs from a webOS device."),
	"",
	"SYNOPSIS",
	help.format(processName + " [OPTION...] [APP_ID]"),
//	"Options (Not implmeneted) :",
//	help.format(processName + " [OPTIONS] --put file://DEVICE_PATH < HOST_FILE"),
//	help.format(processName + " [OPTIONS] --get file://DEVICE_PATH > HOST_FILE"),
//	"",
	"",
	"OPTION",
	help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
	help.format("-D, --device-list", "List the available DEVICEs"),
	help.format("-f, --follow", "Follow the log output (use Ctrl-C to terminate)"),
	help.format("-l, --list", "List the installed app IDs"),
	//help.format("--level <LEVEL>", "Tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
	help.format("-h, --help", "Display this help"),
	help.format("-V, --version", "Display version info"),
	"",
	"DESCRIPTION",
	"",
	help.format("**Restriction**"),
	help.format("this command can display only native application logs, not web application."),
	"", 
	help.format("APP_ID is the id of the application for which logs are shown."),
	"", 
	"Examples:",
	"",
	"# Display logs for app",
	processName + " com.yourdomain.app -d emulator",
	"",
	"# Follow logs for app",
	processName + " -f com.yourdomain.app -d emulator",
	"",
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/
log.verbose("argv", argv);
argv.appId = (argv.argv.remain.length > 0)? argv.argv.remain[0] : null;

var op;
if (argv.list) {
	op = list;
} else if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else if (argv.run) {
	op = run;
} else if (argv.appId || (argv.appId === null && argv.device)) {
	op = printLog;
} else if (argv.version) {
	versionTool.showVersionAndExit();
} else if (argv.help) {
	help.print(helpString);
	cliControl.end();
} else {
	cliControl.end();
}

var options = {
	device: argv.device
};

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

/**********************************************************************/

function list(next) {
	ipkg.installer.list(options, function(err, pkgs) {
		var strPkgs = "";
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			strPkgs = strPkgs.concat(pkg.id).concat('\n');
		});
		process.stdout.write(strPkgs);
		finish(err);
	});
}

function isInstalled(appId, next) {
	var installed = false;
	if (appId === null) {
		return next();
	}
	ipkg.installer.list(options, function(err, pkgs) {
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			if(pkg.id == appId) {
				installed = true;
				return;
			}
		});
		if (!installed) {
			next(new Error(appId + " is not installed."));
		} else {
			next();
		}
	});
}

function run(next) {
	var session = new novacom.Session(options.device, function(err, result) {
		log.verbose("run()", "argv:", argv.run);
		log.verbose("run()", "options:", options);
		if (err) {
			next(err);
			return;
		}
		session.run(argv.run, process.stdin, process.stdout, process.stderr, next);
	});
}

function printLog(next) {
	log.verbose("printLog()", "options:", options);
	if (argv.follow) {
		argv.follow = "-f";
	} else {
		argv.follow = "";
	}
	var logFile = "/media/developer/log/devlog";
	var msgNotFoundLog = "Log file does not exist.";
	var command = "test -e " + logFile + " && tail " + argv.follow + " " + logFile + " || echo " + msgNotFoundLog;
	var session;
	async.series([
		isInstalled.bind(null, argv.appId),
		function(next) {
			session = new novacom.Session(options.device, next);
		},
		function(next) {
			session.run(command, process.stdin, _onData, process.stderr, next);
			function _onData(data) {
				var str;
				if (Buffer.isBuffer(data)) {
					str = data.toString();
				} else {
					str = data;
				}
				str.split(/\r?\n/).forEach(_onLine);
			}
			function _onLine(line) {
				//FIXME: current native app does not print appID in log file.
				//var regExp = new RegExp(argv.appId, "gi");
				//if (line.match(regExp) || line.match(msgNotFoundLog)) {
					console.log(line);
				//} 
			}
		}
	], function(err, result) {
		next(err);
	});
}

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		log.error(processName + ": "+ err.toString());
		log.verbose(err.stack);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
	}
	cliControl.end();
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
