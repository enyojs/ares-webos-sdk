#!/usr/bin/env node

var fs = require("fs"),
    util = require('util'),
    path = require('path'),
    async = require('async'),
    versionTool = require('./../lib/version-tools'),
    tools = require('./../lib/ipkg-tools');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	console.error("*** " + processName + ": "+ err.toString());
	process.exit(1);
});

/**********************************************************************/

function PalmPackage() {

	this.destination = '.';
	this.options = {};

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"debug":	Boolean,
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
		"d":		"--debug",
		"o":		"--outdir",
		"c":		"--check",
		"":"",	//no-minify
		"e":		"--app-exclude",
		"r":		"--rom",
		"d":		"--deployscript"
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.helpString = [
		"Usage: ares-package [OPTIONS] ...",
		"",
		"Options:",
		"--help, -h          Display this help and exit",
		"--version           Display version info and exit",
		"--debug, -d         Enable debug mode                           [boolean]",
		"--outdir, -o        Use OUTPUT_DIR as the output directory      [path]",
		"--check, -c         Check the application but don't package it  [boolean]",
		"--no-minify         Skip the minification phase                 [boolean]",
		"--app-exclude, -e   Use EXCLUDE_DIR to exclude dir in package	[path]",
		"                    To exclude multi sub-dirs, it can be used as '-e subdir1 -e subdir2'",
		"--rom, -r           Do not create ipk; instead output a folder structure to OUTPUT_DIR suitable for inclusion in webOS ROM image [boolean]",
		"--deployscript, -d  Path to enyo deploy script [path]"
	];
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
		if (this.argv.debug) {
			this.options.verbose = true;
		}
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

	debug: function(msg) {
		if (this.argv.debug) {
			console.log(msg);
		}
	},

	log: function(msg) {
		console.log(msg);
	},

	exitOnError: function(msg) {
		console.error("*** " + processName + ": "+ msg);
		process.exit(1);
	},

	packageReady: function(err, results) {
		this.debug("projectReady");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
			this.showUsage(1);
		}
		process.exit(0);
	},

	appOk: function(err, results) {
		this.debug("appOk");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
			this.showUsage(1);
		}
		this.log("no problems detected");
		process.exit(0);
	},

	setOutputDir: function(next) {
		this.debug("setOutputDir");

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
		this.debug("checkInputDir");

		// Check the directories, ...
		tools.checkApp(this.argv.argv.remain, this.options, next);
	},

	packageApp: function(next) {
		this.debug("packageApp");

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
