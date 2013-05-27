#!/usr/bin/env node

var fs = require("fs"),
    util = require('util'),
    async = require('async'),
    path = require('path'),
    versionTool = require('./../lib/version-tools'),
    tools = require('./../lib/ipkg-tools');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	console.error("*** " + processName + ": "+ err.toString());
	process.exit(1);
});

/**********************************************************************/

function PalmGenerate() {

	this.destination = undefined;
	this.options = {};
	this.substitutions = [];
	this.templates = {};

	this.repositories = [
		"project-templates.json"
	];

	this.defaultTemplate = 'bootplate-nightly-owo';

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"list":		Boolean,
		"overwrite":	Boolean,
		"template":	String,
		"property":	[String, Array],
		"repository":	[String, Array],
		"debug":	Boolean
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"r":		"--repository",
		"d":		"--debug"
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.argv.template = this.argv.template || this.defaultTemplate;
	this.helpString = [
		"Usage: ares-generate [OPTIONS] APP_DIR",
		"",
		"Options:",
		"  --help, -h          Display this help and exit     ",
		"  --version           Display version info and exit  ",
		"  --list, -l          List the available templates   ",
		"  --overwrite, -f     Overwrite existing files         [boolean]",
		"  --template, -t      Use the template named TEMPLATE  [path]  [default: " + this.defaultTemplate + "]",
		"  --property, -p      Set the property PROPERTY        [string]",
		"  --repository, -r    Also get templates of REPOSITORY [string]",
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
		"",
		"REPOSITORY is an additional list of project templates."
	];
}

PalmGenerate.prototype = {

	checkTemplateValid: function(next) {
		this.debug("checkTemplateValid: " + this.argv.template);
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
		} else {
			fs.mkdirSync(this.destination);
		}
		this.destination = fs.realpathSync(this.destination);
		next();
	},

	instantiateProject: function(next) {
		this.debug("instantiateProject");
		if (this.argv.overwrite) {
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

		if (this.argv.repository) {
			// Some additionnal repos where specified thru --repo xxxx
			if (util.isArray(this.argv.repository)) {
				this.argv.repository.forEach(function(repo) {
					this.repositories.push(repo);
				}, this);
			} else {
				this.repositories.push(this.argv.repository);
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
			console.error("*** " + processName + ": "+ err.toString());
			process.exit(1);
		}
		this.log("Generating " + this.argv.template + " in " + this.destination);
		process.exit(0);
	},

	displayTemplateList: function(err, results) {
		this.debug("displayTemplateList");
		if (err) {
			console.error("*** " + processName + ": "+ err.toString());
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
				versionTool.checkNodeVersion,
				this.loadTemplateList.bind(this),
				this.getTemplateList.bind(this)
			],
			this.displayTemplateList.bind(this));
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

		if (this.argv.list) {
			this.listTemplates();
		} else if (this.argv.version) {
			versionTool.showVersionAndExit();
		} else {
			this.generateProject();
		}
	}
};

// Main
var cmd = new PalmGenerate();
cmd.exec();