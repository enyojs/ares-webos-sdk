var fs 		= require('fs'),
    path 	= require("path"),
    async 	= require('async'),
    log 	= require('npmlog'),
    nopt 	= require('nopt'),
    Table 	= require('easy-table'),
    sprintf = require('sprintf-js').sprintf,
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
	log.info('uncaughtException', err.stack);
	cliControl.end(-1);
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
	"opkg":	Boolean,
	"opkg-param":	[String, null],
	"storage": [String, null],
	"storage-list": Boolean,
	"version":	Boolean,
	"help":		Boolean,
	"hidden-help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
	"d": ["--device"],
	"i": ["--install"],
	"r": ["--remove"],
	"o": ["--opkg"],
	"op": ["--opkg-param"],
	"l": ["--list"],
	"F": ["--listfull"],
	"t": ["--type"],
	"s": ["--storage"],
	"S": ["--storage-list"],
	"D": ["--device-list"],
	"V": ["--version"],
	"h": ["--help"],
	"hh": ["--hidden-help"],
	"v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';
ipkg.installer.log.level = log.level;

/**********************************************************************/

if (argv.help || argv['hidden-help']) {
	showUsage(argv['hidden-help']);
	cliControl.end();
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
} else if (argv['storage-list']) {
	op = listStorage;
} else if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else if (argv['version']) {
	versionTool.showVersionAndExit();
} else {
	op = install;
}

var options = {
	appId: 'com.ares.defaultName',
	device: argv.device,
	opkg: argv['opkg'] || false,
	opkg_param:  argv['opkg-param'],
	storage: argv.storage
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
		help.format("-S, --list-storage", "List the STORAGEs in DEVICE"),
		help.format("-s, --storage", "Specify STORAGE to install"),
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
		"# List the storages in device",
		processName + " -S -d device",
		"",
		"# Install package into device in the attached USB storage",
		processName + " ~/projects/packages/com.examples.app_1.0_all.ipk -d device -s usb1",
		"",
	];

	this.hiddenhelpString = [
		"",
		"EXTRA-OPTION",
		help.format("-o, --opkg", "Use opkg tool for installing/removing package"),
		help.format("-op, --opkg-param <PARAMS>", "parameters for opkg tool"),
		help.format("", "this option is available only for the device allowing root-connection"),
		"EXAMPLES",
		"",
		"# Install .ipk by 'opkg install' command",
		processName+" <PACKAGE_FILE> -d <DEVICE> --opkg",
		"",
		"# Remove .ipk by 'opkg remove' command",
		"# (Note.) To remove a package by opkg command, <PACKAG_NAME> should be specified instead of <APP_ID>",
		"# (Note.) Please refer to 'ares-package --hidden-help', it provides '--pkgname' option for making .ipk",
		processName+" -r <PACKAGE_NAME> -d <DEVICE> --opkg",
		"",
		"# Install .ipk by 'opkg install' with parameters",
		processName+" <PACKAGE_FILE> -d <DEVICE> --opkg --opkg-param \"-o /media/developer/apps\"",
		"",
	];

	help.print(helpString);
	if (hiddenFlag) {
		help.print(hiddenhelpString);
	}
}

function install() {
	var pkgPath = argv.install || argv.argv.remain[0];
	log.info("install():", "pkgPath:", pkgPath);
	if (!pkgPath) {
		showUsage();
		cliControl.end(-1);
	} else {
		if (!fs.existsSync(path.normalize(pkgPath))) {
			return finish(new Error(pkgPath + " does not exist."));
		}
	}
	ipkg.installer.install(options, pkgPath, finish);
}

function list() {
	ipkg.installer.list(options, function(err, pkgs) {
		var strPkgs = "";
		var cnt = 0;
		if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
			if (argv.type) {
				if (argv.type !== pkg.type) {
					return;
				}
			}
			if (cnt++ !== 0) strPkgs = strPkgs.concat('\n');
			strPkgs = strPkgs.concat(pkg.id);
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

function listStorage() {
	var table = new Table;
	ipkg.installer.listStorage(options, function(err, result) {
		if (Array.isArray(result)) {
			log.verbose(JSON.stringify(result, null, "\t"));
			result.forEach(function(storage){
				table.cell('name', storage.name);
				table.cell('type', storage.type);
				table.cell('uri', storage.uri);
				table.newRow();
			});
			console.log(table.toString());
		}
		finish(err);
	});
}

function remove() {
	var pkgId = (argv.remove === 'true')? argv.argv.remain[0] : argv.remove;
	log.info("remove():", "pkgId:", pkgId);
	if (!pkgId) {
		return finish(new Error("APP_ID must be specified"));
	}
	ipkg.installer.remove(options, pkgId, finish);
}

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		log.error(processName + ": "+ err.toString());
		log.verbose(err.stack);
		cliControl.end(-1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		cliControl.end();
	}
}
