#!/usr/bin/env node

/**
 * palm-package
 */

var fs = require("fs"),
    util = require('util'),
    path = require('path'),
    async = require('async'),
    tools = require('./ipkg-tools');

function PalmPackage() {

	this.version = '0.0.1';
	this.destination = '.';
	this.options = {};

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"debug":	Boolean,
		"outdir":	path,
		"check":	Boolean
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"d":		"--debug",
		"o":		"--outdir",
		"c":		"--check"
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
		  "--check, -c         Check the application but don't package it  [boolean]"
	];
}

PalmPackage.prototype = {

	unsupportedOptions: {
		"verbose": 1,
		"noclean": 1,
		"nativecmd": 1,
		"minify": 1
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

	checkAndShowVersion: function() {
		if (this.argv.version) {
			console.log("Version: " + this.version);
			process.exit(0);
		}
	},

	handleOptions: function() {
		if (this.argv.debug || this.argv.verbose) {
			this.options.verbose = true;
		}
		// Pass unsupported options verbatim thru the options Object -- TODO: TBR
		for(var key in this.argv) {
			if (this.unsupportedOptions[key]) {
				this.options[key] = this.argv[key];
			}
		}

		if ( ! this.argv.hasOwnProperty('minify')) {
			this.options.minify = true;
		}
	},

	debug: function(msg) {
		if (this.argv.verbose || this.argv.debug) {
			console.log(msg);
		}
	},

	log: function(msg) {
		console.log(msg);
	},

	exitOnError: function(msg) {
		console.log(msg);
		process.exit(1);
	},

	packageReady: function(err, results) {
		this.debug("projectReady");
		if (err) {
			console.log(err);
			this.showUsage(1);
		}
		process.exit(0);
	},

	appOk: function(err, results) {
		this.debug("appOk");
		if (err) {
			console.log(err);
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
				this.exitOnError("ERROR: '" + this.destination + "' is not a directory");
			}
		} else {
			this.exitOnError("ERROR: '" + this.destination + "' does not exist");
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
				this.setOutputDir.bind(this),
				this.checkInputDir.bind(this),
				this.packageApp.bind(this)
			],
			this.packageReady.bind(this));
	},

	checkApplication: function() {
		async.series([
				this.checkInputDir.bind(this)
			],
			this.appOk.bind(this));
	},

	exec: function() {
		this.handleOptions();
		this.checkAndShowHelp();
		this.checkAndShowVersion();

		if (this.argv.check) {
			this.checkApplication();
		} else {
			this.packageProject();
		}
	}
};

function checkNodeVersion() {
	var version = process.version.match(/[0-9]+.[0-9]+/)[0];
	if (version <= 0.7) {
		process.exit("Only supported on Node.js version 0.8 and above");
	}
}

// Main
checkNodeVersion();

var cmd = new PalmPackage();
cmd.exec();