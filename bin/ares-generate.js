#!/usr/bin/env node

var fs 		= require("fs"),
    url 	= require("url"),
    util 	= require('util'),
    async 	= require('async'),
    path 	= require('path'),
    log 	= require('npmlog'),
    prjgen 		= require('ares-generator'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
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

var plugin = {};

/**********************************************************************/

function PalmGenerate() {

	this.configFile  = path.join(path.dirname(process.argv[1]), '../ide-plugin.json');
	this.destination = undefined;
	this.options = {};
	this.substitutions = [];

	this.defaultSourceType = 'template';

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"list":		String,
		"overwrite":	Boolean,
		"template":	[String, Array],
		"property":	[String, Array],
		"proxy-url":	url,
		"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"P":		"--proxy-url",
		"v":		["--level", "verbose"]
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.argv.list = (this.argv.list === 'true')? this.defaultSourceType:this.argv.list || false;
	this.helpString = [
		"USAGE:",
		help.format(processName + " [OPTIONS] <APP_DIR>", "Generate APP in <APP_DIR>"),
		help.format(processName + " --list, -l [string]", "List the available templates corresponeded with TYPE [default: " + this.defaultSourceType + "]"),
		help.format("", "available TYPE is 'template', 'webosConfig', 'webosService'"),
		help.format(processName + " --help, -h", "Display this help"),
		help.format(processName + " --version, -V", "Display version info"),
		"",
		"OPTIONS:",
		help.format("--template, -t [string]", "Use the template named TEMPLATE"),
		help.format("", "TEMPLATE can be searched via " + processName + " --list, -l"),
		help.format("--property, -p [string]", "Set the property PROPERTY"),
		help.format("--overwrite, -f", "Overwrite existing files [boolean]"),
		help.format("", "PROPERTY (e.g.) '{\"id\": \"com.examples.helloworld\", \"version\":\"1.0.0\", \"type\":\"web\"}'"),
		help.format("--level", "tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-v", "tracing level 'verbose'"),
//		"",
//		"Options (Not implmeneted) :",
//		help.format("--proxy-url, -P", "Use the given HTTP/S proxy URL [url]"),
		"",
		"APP_DIR is the application directory. It will be created if it does not exist.",
		"",
		"PROPERTY defines properties to be used during generation. Properties can be",
		"specified as key-value pairs of the form \"key=value\" or as JSON objects of the",
		"form '{\"key1\":\"value1\", \"key2\":\"value2\", ...}'. Surrounding quotes are required",
		"in both cases.",
		"",
		"TEMPLATE is the application template to use. If not specified, the default",
		"template (the firstone marked with `isDefault: true`).",
		"",
	];

	log.heading = processName;
	log.level = this.argv.level || 'warn';

	this.existed = false;
}

PalmGenerate.prototype = {

	applyDefaultTemplate: function(next) {
		log.info("applyDefaultTemplate");
		this.generator.getSources(this.defaultSourceType, function(err, sources) {
			if(err) {
				next(err);
			} else {
				var matchedSources = sources.filter(function(source){
					return source.isDefault;
				});
				var defaultTemplate = matchedSources[0] || sources[0];
				this.argv.template = defaultTemplate.id;
				log.info("applyDefaultTemplate#defaultTemplate:", this.argv.template);
				next();
			}
		}.bind(this));
	},

	checkTemplateValid: function(next) {
		log.info("checkTemplateValid: " + this.argv.template);
		if (!this.argv.template) {
			this.applyDefaultTemplate(next);
			return;
		}
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
		this.destination = this.argv.argv.remain.splice(0,1).join("");

		// Create the directorie if it does not exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				log.error('checkCreateAppDir', "'" + this.destination + "' is not a directory");
				process.exit(1);
			}
			var childFiles = fs.readdirSync(this.destination).filter(function(file){
				return (['.', '..'].indexOf(file) === -1);
			});
			if (childFiles.length > 0 ) {
				this.existed = true;
			} else {
				this.existed = false;
			}
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
		this.generator.generate(sources, this.substitutions, this.destination, this.options, next);
	},

	convertToJsonFormat: function(str) {
		return str.replace(/\s*"/g, "")
				.replace(/\s*'/g, "")
				.replace("{", "{\"")
				.replace("}","\"}")
				.replace(/\s*,\s*/g, "\",\"")
				.replace(/\s*:\s*/g, "\":\"");
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
				this.argv.property = this.convertToJsonFormat(this.argv.property);
				if (isJson(this.argv.property)) {
					properties = JSON.parse(this.argv.property);
				} else {
					this.insertProperty(this.argv.property, properties);
				}
			} else {
				this.argv.property.forEach(function(prop) {
					var jsonFromArgv = prop + this.argv.argv.remain.join("");
					jsonFromArgv = this.convertToJsonFormat(jsonFromArgv);
					if (this.isJson(jsonFromArgv)) {
						properties = JSON.parse(jsonFromArgv);
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
				var sourceIds = Object.keys(sources);
				sourceIds.forEach(function(sourceId){
					var source = sources[sourceId];
					log.info("displayTemplateList()", "source:", source);
					console.log(util.format("%s\t%s %s", source.id, source.description, source.isDefault ? "(default)" : ""));
				});
				next();
			}
		});
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
		log.verbose("exec");
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
		var genConfig = {
			level: log.level,
			proxyUrl: this.argv["proxy-url"]
		};
		genConfig = util._extend(genConfig, this.plugin.services[0]);

		//Change @PLUGINDIR@ to real path
		var pluginDir = path.dirname(configFile);
		genConfig.sources.forEach(function(source) {
			if (source.files) {
				source.files.forEach(function(file) {
					file.url = file.url.replace(/@PLUGINDIR@/g, pluginDir);
					if (process.platform === 'win32') {
						file.url = file.url.replace(/\\/g,'/');
					}
				});
			}
		});

		this.generator = new prjgen.Generator(genConfig, next);
	}
};

// Main
var cmd = new PalmGenerate();
cmd.exec();
