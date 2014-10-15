var fs  	= require("fs"),
    util 	= require('util'),
    path 	= require('path'),
    async 	= require('async'),
    log 	= require('npmlog'),
    mkdir	= require('mkdirp'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    tools 		= require('./../lib/ipkg-tools'),
    help 		= require('./../lib/helpFormat');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error("*** " + processName + ": "+ err.toString());
	log.info('uncaughtException', err.stack);
	cliControl.end();
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
		"deployscript": String,
		"force": Boolean
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
		"f":		"--force",
		"v":		["--level", "verbose"]
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.helpString = [
		"",
		"NAME",
		help.format(processName + " - Create a webOS application package file"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] APP_DIR [SERVICE_DIR [...]] [PKG_DIR]"),
		"",
		"OPTION",
		help.format("-c, --check", "Check the application but don't package it"),
		help.format("-o, --outdir <OUTPUT_DIR>", "Use OUTPUT_DIR as the output directory"),
		help.format("-n, --no-minify", "Skip the minification phase"),
		help.format("-e, --app-exclude PATTERN", "Exclude files, given as a PATTERN"),
		help.format("-r, --rom"),
		help.format("\t Do not create ipk, instead output a folder structure"),
		help.format("\t to OUTPUT_DIR suitable for inclusion in webOS ROM image"),
		"",
		help.format("-d, --deployscript <deploy.js Path>"),
		help.format("\t Set path to enyo deploy script"),
		"",
		help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
		"",
		"DESCRIPTION",
		help.format("Make .ipk package. APP_DIR means a directory path having app source."),
		"",
		help.format("SERVICE_DIR means a directory path having service source."),
		help.format("If service source path is located under APP_DIR, don't specify SERVICE_DIR."),
		help.format("PKG_DIR means a directory path having packageinfo.json file,"),
		help.format("and if no specified PKG_DIR, " + processName + " makes packageinfo.json from appinfo.json."),
		"",
		help.format("APP_DIR or OUTPUT_DIR can be a relative path or an absolute path."),
		"",
		"EXAMPLES",
		"",
		"# Create a package for the webOS application excluding all text files and the tests directory.",
		processName+" --exclude *.txt --exclude tests",
		"",
		"# Create a package for the webOS application with multiple webOS services",
		processName+" APP_DIR SVC1_DIR SVC2_DIR SVC3_DIR",
		""
	];

	log.heading = processName;
	log.level = this.argv.level || 'warn';
}

PalmPackage.prototype = {

	unsupportedOptions: {
		"noclean": 1,			// Do not cleanup temporary directories - For debug only,
        "force": 1
	},

	showUsage: function(exitCode) {
		if (exitCode === undefined) {
			exitCode = 0;
		}
		help.print(this.helpString);
		cliControl.end(exitCode);
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
			this.options.excludefiles = this.argv['app-exclude'];
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
		cliControl.end();
	},

	packageReady: function(err, results) {
		log.info("projectReady");
		if (err) {
			log.error(processName + ": "+ err.toString());
			log.verbose(err.stack);
		}
		if (results && results[results.length-1] && results[results.length-1].msg) {
			console.log(results[results.length-1].msg);
		}
		cliControl.end();
	},

	appOk: function(err, results) {
		log.info("appOk");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
		}
		console.log("no problems detected");
		cliControl.end();
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
			log.verbose("creating directory '" + this.destination + "' ...");
			mkdirp.sync(this.destination);
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
