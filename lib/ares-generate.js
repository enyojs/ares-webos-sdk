#!/usr/bin/env node

/**
 * palm-generate
 */

var fs = require("fs"),
    optimist = require('optimist'),
    util = require('util'),
    async = require('async'),
    path = require('path'),
    tools = require('./ipkg-tools');

function PalmGenerate() {

	this.version = '0.0.1';
	this.destination = undefined;
	this.options = {};
	this.substitutions = [];
	this.templates = {};

	this.repositories = [
		"project-templates.json"
	];

	this.defaultTemplate = 'bootplate-2.1.1-owo';

	this.localTemplates = undefined;

	this.argv = optimist.usage('\nUsage: ares-generate [OPTIONS] APP_DIR')
		.options({
			help : {
				alias : 'h',
				description : 'Display this help and exit'
			},
			version : {
				description : 'Display version info and exit'
			},
			list : {
				alias : 'l',
				description : 'List the available templates'
			},
			overwrite: {
				alias: 'f',
				description: "Overwrite existing files",
				boolean: true
			},
			debug : {
				alias: 'verbose',
				description : 'Enable debug mode',
				boolean: true
			},
			template : {
				alias : 't',
				string: true,
				description : 'Use the template named TEMPLATE',
				"default" : this.defaultTemplate
			},
			property : {
				alias : 'p',
				string: true,
				description : 'Set the property PROPERTY'
			}
		}).argv;

	this.helpFooter = [
		"APP_DIR is the application directory. It will be created if it does not exist.",
		"",
		"PROPERTY defines properties to be used during generation. Properties can be",
		"specified as key-value pairs of the form \"key=value\" or as JSON objects of the",
		"form \"{'key1':'value1', 'key2':'value2', ...}\". Surrounding quotes are required",
		"in both cases.",
		"",
		"TEMPLATE is the application template to use. If not specified, the default",
		"template is used ('" + this.defaultTemplate + "').",
		""
	];
}

PalmGenerate.prototype = {

	checkTemplateValid: function(next) {
		this.debug("checkTemplateValid");
		// Verify it's a string
		if (typeof this.argv.template != 'string') {
			this.showUsage();
		}

		// TODO: Verify the template exist

		next();
	},

	checkCreateAppDir: function(next) {
		this.debug("checkCreateAppDir");
		// Verify we have an APP_DIR parameter
		if (this.argv._.length != 1) {
			this.showUsage();
		}
		this.destination = this.argv._[0];

		// Create the directorie if it does not exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				console.log("ERROR: '" + this.destination + "' is not a directory");
				process.exit(1);
			}
		} else {
			fs.mkdirSync(this.destination);
		}
		this.destination = fs.realpathSync(this.destination);
		next();
	},

	instantiateProject: function(next) {
		this.debug("instantiateProject");
		if (this.argv.overwitre) {
			this.options.overwrite = true;
		}

		tools.generate(this.argv.template, this.substitutions, this.destination, this.options, function(inError, inData) {
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

	loadTemplateList: function(next) {
		this.debug("loadTemplateList");

		if (this.localTemplates) {
			tools.registerTemplates(this.localTemplates);
		}

		if (this.argv.repo) {
			// Some additionnal repos where specified thru --repo xxxx
			if (util.isArray(this.argv.repo)) {
				this.argv.repo.forEach(function(repo) {
					this.repositories.push(repo);
				}, this);
			} else {
				this.repositories.push(this.argv.repo);
			}
		}

		if (this.repositories.length > 0) {

			// Locate the template directory
			var templatesDir = path.join(path.dirname(process.argv[1]), '../templates');

			async.forEachSeries(this.repositories, function(item, callback) {
				if (item.substr(0, 4) !== 'http') {
					// Resolve the path of template files
					item = path.resolve('templates', templatesDir, item);
				}
				tools.registerRemoteTemplates(item, callback);
			}, next);
		} else {
			next();
		}
	},

	getTemplateList: function(next) {
		this.debug("getTemplateList");
		tools.list(function(err, data) {
			if (err) {
				next(err);
				return;
			}
			data.forEach(function(template) {
				this.templates[template.id] = template;
			}, this);
			next();
		}.bind(this));
	},

	projectReady: function(err, results) {
		this.debug("projectReady");
		if (err) {
			console.log(err);
			process.exit(1);
		}
		this.log("Generating " + this.argv.template + " in " + this.destination);
		process.exit(0);
	},

	displayTemplateList: function(err, results) {
		this.debug("displayTemplateList");
		if (err) {
			console.log(err);
			process.exit(1);
		}
		var keys = Object.keys(this.templates);
		keys.forEach(function(key) {
			console.log(util.format("%s\t%s", key, this.templates[key].description));
		}, this);

		process.exit(0);
	},

	listTemplates: function() {
		async.series([
				this.loadTemplateList.bind(this),
				this.getTemplateList.bind(this)
			],
			this.displayTemplateList.bind(this));
	},

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
		if (this.argv.debug || this.argv.verbose) {
			this.options.verbose = true;
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

	generateProject: function() {
		async.series([
			this.checkCreateAppDir.bind(this),
			this.loadTemplateList.bind(this),
			this.checkTemplateValid.bind(this),
			this.manageProperties.bind(this),
			this.instantiateProject.bind(this)
			],
			this.projectReady.bind(this));
	},

	exec: function() {
		this.handleOptions();
		this.checkAndShowHelp();
		this.checkAndShowVersion();

		if (this.argv.list) {
			this.listTemplates();
		} else {
			this.generateProject();
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

var cmd = new PalmGenerate();
cmd.exec();