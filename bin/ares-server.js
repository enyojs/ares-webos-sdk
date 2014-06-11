var fs 		= require('fs'),
    path 	= require("path"),
    sprintf = require('sprintf').sprintf,
    npmlog 	= require('npmlog'),
    nopt 	= require('nopt'),
    ipkg 		= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    help 		= require('./../lib/helpFormat'),
	util 		= require('./../lib/utility');

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
	"version":	Boolean,
	"help":		Boolean,
	"open":	Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"V": ["--version"],
	"h": ["--help"],
	"o": ["--open"],
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

var op;
if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = runServer;
}

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
		help.format(processName + " - Runs a local web server based on path"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] <APP_DIR>"),
		"",
		"OPTION",
		help.format("-o, --open", "Open localhost url with a web browser"),
		"",
		//help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		""
	];

	help.print(helpString);
}

function runServer() {
	var appPath = argv.argv.remain.splice(0,1).join("");
	if (!appPath) {
		return finish("Please check the app directory path for web server");
	}
	appPath = fs.realpathSync(appPath);
	util.runServer(appPath,0, _postAction)

	function _postAction(err, serverInfo) {
		if (err) {
			console.log(processName + ": "+ err.toString());
			process.exit(1);
		} else {
			if (serverInfo && serverInfo.msg) {
				console.log(serverInfo.msg);
				if (argv.open && serverInfo.url) {
					util.openBrowser(serverInfo.url);
				}
			}
		}
	}
}

function finish(err, value) {
	if (err) {
		log.error(err);
		log.verbose(err.stack);
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
