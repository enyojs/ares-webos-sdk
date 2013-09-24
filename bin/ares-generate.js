#!/usr/bin/env node

var fs = require("fs"),
    util = require('util'),
    async = require('async'),
    path = require('path'),
    log = require('npmlog'),
    versionTool = require('./../lib/version-tools'),
    prjgen = require('ares-generator');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.error("*** " + processName + ": "+ err.toString());
	log.info('uncaughtException', err.stack);
	process.exit(1);
});

var plugin = {};

/**********************************************************************/

function PalmGenerate() {

	this.configFile  = path.join(path.dirname(process.argv[1]), '../ide-plugin.json');
	this.destination = undefined;
	this.options = {};
	this.substitutions = [];

	this.defaultTemplate = 'bootplate-nightly';
	this.defaultSourceType = 'template';
	this.essentialTemplates = ['webos-app-config'];

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"list":		String,
		"overwrite":	Boolean,
		"template":	[String, Array],
		"property":	[String, Array],
		"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"v":		["--level", "verbose"]
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
		"form '{\"key1\":\"value1\", \"key2\":\"value2\", ...}'. Surrounding quotes are required",
		"in both cases.",
		"",
		"TEMPLATE is the application template to use. If not specified, the default",
		"template is used ('" + this.defaultTemplate + "')."
	];

	log.heading = processName;
	log.level = this.argv.level || 'warn';

	this.existed = false;
}

PalmGenerate.prototype = {

	checkTemplateValid: function(next) {
		log.info("checkTemplateValid: " + this.argv.template);
		// Verify it's a string
		if ((typeof this.argv.template != 'string') && !(this.argv.template instanceof Array)){
			this.showUsage();
		}
		// TODO: Verify the template exist

		next();
	},

	checkCreateAppDir: function(next) {
		log.info("checkCreateAppDir");
		// Verify we have an APP_DIR parameter
		if (this.argv.argv.remain.length != 1) {
			this.showUsage();
		}
		this.destination = this.argv.argv.remain[0];

		// Create the directorie if it does not exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				log.error('checkCreateAppDir', "'" + this.destination + "' is not a directory");
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
		log.info("instantiateProject");
		if (this.argv.overwrite || !this.existed) {
			this.options.overwrite = true;
		}

		var sources = (this.argv.template instanceof Array)? this.argv.template : [this.argv.template];
		var essentialSources = this.essentialTemplates.filter(function(source) {
			return sources.indexOf(source) === -1;
		});
		sources = sources.concat(essentialSources);
		this.generator.generate(sources, this.substitutions, this.destination, this.options, next);
	},

	isJson: function(str) {
		try {
			JSON.parse(str);
		} catch(err) {
			return false;
		}
		return true;
	},

	insertProperty: function(prop, properties) {
		var values = prop.split('=');
		properties[values[0]] = values[1];
		log.info("Inserting property " + values[0] + " = " + values[1]);
	},

	manageProperties: function(next) {
		log.info("manageProperties");
		var properties = {};
		if (this.argv.property) {
			if (typeof this.argv.property === 'string') {
				if (isJson(this.argv.property)) {
					properties = JSON.parse(this.argv.property);
				} else {
					this.insertProperty(this.argv.property, properties);
				}
			} else {
				this.argv.property.forEach(function(prop) {
					if (this.isJson(prop)) {
						properties = JSON.parse(prop);
					} else {
						this.insertProperty(prop, properties);
					}
				}, this);
			}
			this.substitutions.push({ fileRegexp: "appinfo.json", json: properties});
		}
		next();
	},

	projectReady: function(err, results) {
		log.info("projectReady", "err:", err, "results:", results);
		if (err) {
			log.error("*** " + processName + ": "+ err.toString());
			log.verbose(err.stack);
			process.exit(1);
		}
		log.info("projectReady", "Generating " + this.argv.template + " in " + this.destination);
		process.exit(0);
	},

	displayTemplateList: function(type, next) {
		log.info("displayTemplateList");
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
			], (function(err, results) {
				if (err) {
					log.error("*** " + processName + ": "+ err.toString());
					log.verbose(err.stack);
					process.exit(1);
				}
				process.exit(0);
			}).bind(this));
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

	generateProject: function() {
		log.verbose("generateProject");
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
		this.checkAndShowHelp();
		if (this.argv.version) {
			versionTool.showVersionAndExit();
		}
		async.series([
			this.loadPluginConfig.bind(this, this.configFile),
			(function(next) {
				if (this.argv.list) {
					this.listSources(this.argv.list);
				} else {
					this.generateProject();
				}
			}).bind(this)
		], function(err) {
			if (err) {
				log.error("exec", err.toString());
				log.info("exec", err.stack);
			}
		});
	},

	loadPluginConfig: function(configFile, next) {
		if (!fs.existsSync(configFile)) {
			throw "Did not find: '"+configFile+"': ";
		}
		var configStats = fs.lstatSync(configFile);
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
			return service.hasOwnProperty('sources');
		});
		this.generator = new prjgen.Generator(this.plugin.services[0], next);
	}
};

// Main
var cmd = new PalmGenerate();
cmd.exec();
