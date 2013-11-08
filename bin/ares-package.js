#!/usr/bin/env node

var f 		= require("fs"),
    util 	= require('util'),
    path 	= require('path'),
    async 	= require('async'),
    log 	= require('npmlog'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    tools 		= require('./../lib/ipkg-tools'),
    help 		= require('./../lib/helpFormat');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error("*** " + processName + ": "+ err.toString());
	log.info('uncaughtException', err.stack);
	process.exit(1);
});

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

function PalmPackage() {

	this.destination = '.';
	this.options = {};

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
		"outdir":	path,
		"check":	Boolean,
		"no-minify":	Boolean,
		"app-exclude" : [String, Array],
		"rom":		Boolean,
		"deployscript": String
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"o":		"--outdir",
		"c":		"--check",
		"n":		"--no-minify",
		"e":		"--app-exclude",
		"r":		"--rom",
		"d":		"--deployscript",
		"v":		["--level", "verbose"]
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.helpString = [
		"",
		"NAME",
		help.format(processName + " - Creates application package file for webOS TV."),
		"",
		"SYNOPSIS",
		help.format(processName + " [COMMAND]"),
		help.format(processName + " [OPTIONS] APP_DIR [SERVICE_DIR] [PKG_DIR]"),
		"",
		"DESCRIPTION",
		help.format("Make .ipk package. APP_DIR means a directory path having app source."),
		"",
		help.format("SERVICE_DIR means a directory path having service source"),
		help.format("if service source path is locating under APP_DIR, don't have to"),
		help.format("specify SERVICE_DIR PKG_DIR means a directory path having"),
		help.format("packageinfo.json file if no specified PKG_DIR, " + processName),
		help.format("makes packageinfo.json from appinfo.json"),
		"",
		help.format("APP_DIR or OUTPUT_DIR can be a relative path or an absolute path."),
		help.format("OPTIONS can be used overlapped, but COMMAND is used isolated."),
		"",
		"OPTIONS",
		help.format("--check, -c"),
		help.format("\t Check the application but don't package it"),
		"",
		help.format("--outdir, -o [path]"),
		help.format("\t Use OUTPUT_DIR as the output directory"),
		"",
		help.format("--no-minify, -n"),
		help.format("\t Skip the minification phase"),
		"",
		help.format("--app-exclude, -e [path]"),
		help.format("\t Use EXCLUDE_DIR to exclude dir in package"),
		help.format("\t To exclude multi sub-dirs, it can be used as '-e subdir1 -e subdir2'"),
		help.format("\t (e.g.) app_dir/"),
		help.format("\t          +--- subdir1/file1-A.txt"),
		help.format("\t          +--- subdir1/file1-B.txt"),
		help.format("\t          +--- subdir2/file2-C.txt"),
		help.format("\t          +--- subdir2/file2-D.txt"),
		help.format("\t       To exclude 'subdir1' and 'subdir2/file2-D.txt' from .ipk pakcage,"),
		help.format("\t       user can use '" + processName + " app_dir -e subdir1 -e subdir2/file2-D.txt'"),
		"",
		help.format("--rom, -r  [boolean]"),
		help.format("\t Do not create ipk, instead output a folder structure"),
		help.format("\t to OUTPUT_DIR suitable for inclusion in webOS ROM image"),
		"",
		help.format("--deployscript, -d [path]"),
		help.format("\t Set path to enyo deploy script"),
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
		help.format("--version, -V"),
		help.format("\t Display version info"),
		""
	];

	log.heading = processName;
	log.level = this.argv.level || 'warn';
}

PalmPackage.prototype = {

	unsupportedOptions: {
		"noclean": 1			// Do not cleanup temporary directories - For debug only
	},

	showUsage: function(exitCode) {
		if (exitCode === undefined) {
			exitCode = 0;
		}
		this.helpString.forEach(function(line) {
			console.log(line);
		});
		process.exit(exitCode);
	},

	checkAndShowHelp: function() {
		if (this.argv.help) {
			this.showUsage();
		}
	},

	handleOptions: function() {
		this.options.level = log.level;

		// Pass unsupported options verbatim thru the options Object -- TODO: TBR
		for(var key in this.argv) {
			if (this.unsupportedOptions[key]) {
				this.options[key] = this.argv[key];
			}
		}

		if (this.argv.hasOwnProperty('minify')) {
			this.options.minify = this.argv.minify;
		} else {
			this.options.minify = true;
		}

		if (this.argv.hasOwnProperty('app-exclude')) {
			this.options.excludedir = this.argv['app-exclude'];
		}

		if (this.argv.hasOwnProperty('rom')) {
			this.options.rom = this.argv.rom;
		} else {
			this.options.rom = false;
		}

		if (this.argv.hasOwnProperty('deployscript')) {
			this.options.deployscript = this.argv.deployscript;
		}

	},

	exitOnError: function(msg) {
		console.error("*** " + processName + ": "+ msg);
		process.exit(1);
	},

	packageReady: function(err, results) {
		log.info("projectReady");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
			this.showUsage(1);
		}
		process.exit(0);
	},

	appOk: function(err, results) {
		log.info("appOk");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
			this.showUsage(1);
		}
		console.log("no problems detected");
		process.exit(0);
	},

	setOutputDir: function(next) {
		log.info("setOutputDir");

		if (this.argv.outdir) {
			this.destination = this.argv.outdir;
		}

		if (this.destination === '.') {
			this.destination = process.cwd();
		}

		// Check that the directorie exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				this.exitOnError("'" + this.destination + "' is not a directory");
			}
		} else {
			this.exitOnError("'" + this.destination + "' does not exist");
		}
		this.destination = fs.realpathSync(this.destination);
		next();
	},

	checkInputDir: function(next) {
		log.info("checkInputDir");

		// Check the directories, ...
		tools.checkApp(this.argv.argv.remain, this.options, next);
	},

	packageApp: function(next) {
		log.info("packageApp");

		tools.packageApp(this.argv.argv.remain, this.destination, this.options, next);
	},

	packageProject: function() {
		async.series([
				versionTool.checkNodeVersion,
				this.setOutputDir.bind(this),
				this.checkInputDir.bind(this),
				this.packageApp.bind(this)
			],
			this.packageReady.bind(this));
	},

	checkApplication: function() {
		async.series([
				versionTool.checkNodeVersion,
				this.checkInputDir.bind(this)
			],
			this.appOk.bind(this));
	},

	exec: function() {
		this.handleOptions();
		this.checkAndShowHelp();

		if (this.argv.check) {
			this.checkApplication();
		} else if (this.argv.version) {
			versionTool.showVersionAndExit();
		} else {
			this.packageProject();
		}
	}
};

// Main
var cmd = new PalmPackage();
cmd.exec();
