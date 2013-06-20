#!/usr/bin/env node

var fs = require("fs"),
    util = require('util'),
    async = require('async'),
    path = require('path'),
    versionTool = require('./../lib/version-tools'),
	prjgen = require('ares-generator');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	console.error("*** " + processName + ": "+ err.toString());
	process.exit(1);
});

var plugin = {};

/**********************************************************************/

function PalmGenerate() {

	this.configFile  = path.join(path.dirname(process.argv[1]), '../ide-plugin.json');
	this.destination = undefined;
	this.options = {};
	this.substitutions = [];

	this.defaultTemplate = 'bootplate-webos-nightly';
	this.defaultSourceType = 'template';

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"list":		String,
		"overwrite":	Boolean,
		"template":	[String, Array],
		"property":	[String, Array],
		"debug":	Boolean
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"d":		"--debug",
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.argv.list = (this.argv.list === 'true')? this.defaultSourceType:this.argv.list || false;
	this.argv.template = this.argv.template || this.defaultTemplate;
	this.helpString = [
		"Usage: ares-generate [OPTIONS] APP_DIR",
		"",
		"Options:",
		"  --help, -h          Display this help and exit     ",
		"  --version           Display version info and exit  ",
		"  --list, -l          List the available sources       [string]  [default: " + this.defaultSourceType + "]",
		"  --overwrite, -f     Overwrite existing files         [boolean]",
		"  --template, -t      Use the template named TEMPLATE  [path]  [default: " + this.defaultTemplate + "]",
		"  --property, -p      Set the property PROPERTY        [string]",
		"  --debug, -d         Enable debug mode                [boolean]",
		"",
		"APP_DIR is the application directory. It will be created if it does not exist.",
		"",
		"PROPERTY defines properties to be used during generation. Properties can be",
		"specified as key-value pairs of the form \"key=value\" or as JSON objects of the",
		"form \"{'key1':'value1', 'key2':'value2', ...}\". Surrounding quotes are required",
		"in both cases.",
		"",
		"TEMPLATE is the application template to use. If not specified, the default",
		"template is used ('" + this.defaultTemplate + "').",
	];

	this.existed = false;
}

PalmGenerate.prototype = {

	checkTemplateValid: function(next) {
		this.debug("checkTemplateValid: " + this.argv.template);
		// Verify it's a string
		if ((typeof this.argv.template != 'string') && !(this.argv.template instanceof Array)){
			this.showUsage();
		}
		// TODO: Verify the template exist

		next();
	},

	checkCreateAppDir: function(next) {
		this.debug("checkCreateAppDir");
		// Verify we have an APP_DIR parameter
		if (this.argv.argv.remain.length != 1) {
			this.showUsage();
		}
		this.destination = this.argv.argv.remain[0];

		// Create the directorie if it does not exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				console.error("'" + this.destination + "' is not a directory");
				process.exit(1);
			}
			this.existed = true;
		} else {
			fs.mkdirSync(this.destination);
			this.existed = false;
		}
		this.destination = fs.realpathSync(this.destination);
		next();
	},

	instantiateProject: function(next) {
		this.debug("instantiateProject");
		if (this.argv.overwrite) {
			this.options.overwrite = true;
		}

		if (this.existed !== undefined) {
			this.options.existed = this.existed;
		}

		var sources = (this.argv.template instanceof Array)? this.argv.template : [this.argv.template];
		async.series([
			this.generator.setOptions.bind(this.generator, this.options),
			this.generator.generate.bind(this.generator, sources, this.substitutions, this.destination)
		], function(inError, inData) {
			if (inError) {
				next("An error occured, err: " + inError);
				return;
			}
			next();
		});
	},

	insertProperty: function(prop, properties) {
		var values = prop.split('=');
		properties[values[0]] = values[1];
		this.debug("Inserting property " + values[0] + " = " + values[1]);
	},

	manageProperties: function(next) {
		this.debug("manageProperties");
		var properties = {};
		if (this.argv.property) {
			if (typeof this.argv.property === 'string') {
				this.insertProperty(this.argv.property, properties);
			} else {
				this.argv.property.forEach(function(prop) {
					this.insertProperty(prop, properties);
				}, this);
			}
			this.substitutions.push({ fileRegexp: "appinfo.json", json: properties});
		}
		next();
	},

	projectReady: function(err, results) {
		this.debug("projectReady");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
			process.exit(1);
		}
		this.log("Generating " + this.argv.template + " in " + this.destination);
		process.exit(0);
	},

	displayTemplateList: function(type, next) {
		this.debug("displayTemplateList");
		this.generator.getSources(type, function(err, sources) {
				if(err) {
					next(err);
				} else {
					sources.forEach(function(source){
							console.log(util.format("%s\t%s", source.id, source.description));
						});
					next();
				}
			});
		next();
	},

	listSources: function(type) {
		async.series([
				versionTool.checkNodeVersion,
				this.displayTemplateList.bind(this, type)
			], function(err, results) {
				if (err) {
					console.error("*** " + processName + ": "+ err.toString());
					process.exit(1);
				}
				process.exit(0);
			}.bind(this));
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
	},

	debug: function(msg) {
		if (this.argv.debug) {
			console.log(msg);
		}
	},

	log: function(msg) {
		console.log(msg);
	},

	generateProject: function() {
		async.series([
				versionTool.checkNodeVersion,
				this.checkCreateAppDir.bind(this),
				this.checkTemplateValid.bind(this),
				this.manageProperties.bind(this),
				this.instantiateProject.bind(this)
			],
			this.projectReady.bind(this));
	},

	exec: function() {
		this.handleOptions();
		this.checkAndShowHelp();
		this.loadPluginConfig(this.configFile);
	
		if (this.argv.list) {
			this.listSources(this.argv.list);
		} else if (this.argv.version) {
			versionTool.showVersionAndExit();
		} else {
			this.generateProject();
		}
	},

	loadPluginConfig: function(configFile) {
		if (!fs.existsSync(configFile)) {
			throw "Did not find: '"+configFile+"': ";
		}
		configStats = fs.lstatSync(configFile);
		if (!configStats.isFile()) {
			throw "Not a file: '"+configFile+"': ";
		}
		var configContent = fs.readFileSync(configFile, 'utf8');
		try {
			this.plugin = JSON.parse(configContent);
		} catch(e) {
			throw "Improper JSON: "+configContent;
		}
		if (!this.plugin.services || !this.plugin.services[0]) {
			throw "Corrupted '"+configFile+"': no services defined";
		}
		this.plugin.services = this.plugin.services.filter(function(service){
				return service.hasOwnProperty('sources');});
		this.generator = new prjgen.Generator(this.plugin.services[0], function(err) {
				}); //FIXME: change THIS!!
	}
};

// Main
var cmd = new PalmGenerate();
cmd.exec();
