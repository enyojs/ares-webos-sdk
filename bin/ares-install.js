#!/usr/bin/env node

var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    npmlog 	= require('npmlog'),
    sprintf = require('sprintf').sprintf,
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
	log.info('uncaughtException', err.stack);
	process.exit(1);
});

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}
/**********************************************************************/

var knownOpts = {
	"device":	[String, null],
	"device-list":	Boolean,
	"list":		Boolean,
	"listfull":	Boolean,
	"type":		[String, null],
	"install":	path,
	"remove":	String,
	"version":	Boolean,
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"i": ["--install"],
	"r": ["--remove"],
	"l": ["--list"],
	"F": ["--listfull"],
	"t": ["--type"],
	"D": ["--device-list"],
	"V": ["--version"],
	"h": ["--help"],
	"v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';
ipkg.installer.log.level = log.level;

/**********************************************************************/

if (argv.help) {
	showUsage();
	process.exit(0);
}

log.verbose("argv", argv);

var op;
if (argv.list) {
	op = list;
} else if (argv.listfull) {
	op = listFull;
} else if (argv.install) {
	op = install;
} else if (argv.remove) {
	op = remove;
} else if (argv['device-list']) {
	op = deviceList;
} else if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = install;
}

var options = {
	appId: 'com.ares.defaultName',
	device: argv.device
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
		help.format(processName + " - Install/Remove applications"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] <PACKAGE_FILE>"),
		"",
		help.format(processName + " [OPTION...] -r, --remove <APP_ID>"),
		"",
		"OPTION",
		help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
		help.format("-D, --device-list", "List the available DEVICEs"),
		help.format("-l, --list", "List the installed app IDs"),
		help.format("-F, --listfull", "List the installed app detailed infomatins"),
		help.format("-t, --type <TYPE>", "Specify app TYPE (web, native, ...)"),
		help.format("", 					"followed by '--list' or '--listfull'"),
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
		help.format("To install .ipk package into TARGET DEVICE,"),
		help.format("user have to specify the TARGET DEVICE using '--device, -d' option"),
		"",
		help.format("APP_ID is an application id described in appinfo.json"),
		"", 
		"Examples:",
		"",
		"# Install package into emulator",
		processName + " ~/projects/packages/com.examples.app_1.0_all.ipk -d emulator",
		"",
		"# Remove an application on emulator",
		processName + " -r com.examples.app -d emulator",
		"",
		"# List the applications installed in emulator",
		processName + " -l -d emulator",
		"",
		"# List web type apps among the applications installed in emulator",
		processName + " -l -t web -d emulator",
		"",
	];

	helpString.forEach(function(line) {
		console.log(line);
	});
}

function install() {
	var pkgPath = argv.install || argv.argv.remain[0];
	log.info("install():", "pkgPath:", pkgPath);
	if (!pkgPath) {
		help();
		process.exit(1);
	}
	ipkg.installer.install(options, pkgPath, finish);
}

function list() {
	ipkg.installer.list(options, function(err, pkgs) {
		var strPkgs = "";
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			if (argv.type) {
				if (argv.type !== pkg.type) {
					return;
				}
			}
				strPkgs = strPkgs.concat(pkg.id).concat('\n');
		});
		console.log(strPkgs);
		finish(err);
	});
}

function listFull() {
	ipkg.installer.list(options, function(err, pkgs) {
		var strPkgs = "";
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			if (argv.type) {
				if (argv.type !== pkg.type) {
					return;
				}
			}
			strPkgs = strPkgs.concat('----------------\n');
			strPkgs = strPkgs.concat("id:"+ pkg.id+", ");
			for (key in pkg) {
				if (key == "id") continue;
				strPkgs = strPkgs.concat(key+":").concat(pkg[key]).concat(", ");
			}
			strPkgs = strPkgs.concat('\n');
		});
		process.stdout.write(strPkgs);
		finish(err);
	});
}

function remove() {
	var pkgId = (argv.remove === 'true')? argv.argv.remain[0] : argv.remove;
	log.info("remove():", "pkgId:", pkgId);
	if (!pkgId) {
		help();
		process.exit(1);
	}
	ipkg.installer.remove(options, pkgId, finish);
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

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		console.log(processName + ": "+ err.toString());
		process.exit(1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		process.exit(0);
	}
}
