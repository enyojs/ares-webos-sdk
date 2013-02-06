#!/usr/bin/env node

/**
 * palm-package
 */

/*
	Examples:
	./palm-package.js ~/GIT/TipCalc/deploy/TipCalc --debug
 */

var fs = require("fs"),
    optimist = require('optimist'),
    util = require('util'),
    path = require('path'),
    async = require('async'),
    tools = require('nodejs-module-webos-ipkg');

function PalmPackage() {

	this.version = '0.0.1';
	this.destination = '.';
	this.options = {};

	this.argv = optimist.usage('palm-package\nUsage: $0 [OPTIONS] ...')
		.options({
			help : {
				alias : 'h',
				description : 'Display this help and exit'
			},
			version : {
				description : 'Display version info and exit'
			},
			outdir : {
				alias : 'o',
				string: true,
				description : 'Use OUTPUT_DIR as the output directory'
			},
			check : {
				description : "Check the application but don't package it"
			}
		}).argv;

	this.helpFooter = [
		"TBC",
		""
	];
}

PalmPackage.prototype = {

	showUsage: function(exitCode) {
		if (exitCode === undefined) {
			exitCode = 0;
		}
		optimist.showHelp();
		this.helpFooter.forEach(function(line) {
			console.log(line);
		});
		process.exit(0);
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
		if (this.argv.debug) {
			this.options.verbose = true;
		}
		if (this.argv.noclean) {					// TODO: To remove ?
			this.options.noclean = true;
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
		console.log(msg);
		process.exit(1);
	},

	packageReady: function(err, results) {
		this.debug("projectReady");
		if (err) {
			console.log(err);
			process.exit(1);
		}
		console.log("DONE");
		process.exit(0);
	},

	setOutputDir: function(next) {
		this.debug("setOutputDir");

		if (this.argv.outdir) {
			this.destination = this.argv.outdir;
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
		next();
	},

	checkInputDir: function(next) {
		this.debug("checkInputDir");

		if (this.argv._.length < 1) {
			this.showUsage();
		}

		tools.checkApp(this.argv._, this.options, next);
	},

	packageApp: function(next) {
		this.debug("packageApp");

		tools.packageApp(this.argv._, this.destination, this.options, next);
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
		this.exitOnError("--check is not yet implemented");
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