#!/usr/bin/env node

/**
 * palm-generate
 */

/*
	Examples:
	./palm-generate.js -t ddd -p "p1=one" -p "p2=two" -p "{'id':'three'}"  DESTI
	./palm-generate.js -t webos-app -p id=com.ydm --debug -p version=1.2.3 DESTI
 */

var fs = require("fs"),
    optimist = require('optimist'),
    util = require('util'),
    async = require('async'),
    tools = require('nodejs-module-webos-ipkg');

(function () {

	var pversion = '10.0.1';
	var destination;
	var options = {};
	var substitutions = [];

	// Main
	var version = process.version.match(/[0-9]+.[0-9]+/)[0];
	if (version <= 0.7) {
		process.exit("Only supported on Node.js version 0.8 and above");
	}

	var argv = optimist.usage('palm-generate\nUsage: $0 [OPTIONS] APP_DIR')
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
				description: "Overwrite existing files"
			},
			debug : {
				description : 'List the available templates'
			},
			template : {
				alias : 't',
				string: true,
				description : 'Use the template named TEMPLATE',
				"default" : 'enyo_singlepane'
			},
			property : {
				alias : 'p',
				string: true,
				description : 'Set the property PROPERTY'
			}
		}).argv;

	var helpFooter = [
		"APP_DIR is the application directory. It will be created if it does not exist.",
		"",
		"PROPERTY defines properties to be used during generation. Properties can be",
		"specified as key-value pairs of the form \"key=value\" or as JSON objects of the",
		"form \"{'key1':'value1', 'key2':'value2', ...}\". Surrounding quotes are required",
		"in both cases.",
		"",
		"TEMPLATE is the application template to use. If not specified, the default",
		"template is used ('enyo_singlepane').",
		""
	];

	function showUsage(exitCode) {
		if (exitCode === undefined) {
			exitCode = 0;
		}
		optimist.showHelp();
		helpFooter.forEach(function(line) {
			console.log(line);
		});
		process.exit(0);
	}

	function checkTemplateValid() {
		// Verify it's a string
		if (typeof argv.template != 'string') {
			showUsage();
		}

		// Verify it exist
		// TODO: TBC
	}

	function checkCreateAppDir() {
		// Verify we have an APP_DIR parameter
		if (argv._.length != 1) {
			showUsage();
		}
		destination = argv._[0];

		// Create the directorie if it does not exist
		if (fs.existsSync(destination)) {
			var stats = fs.statSync(destination);
			if ( ! stats.isDirectory()) {
				console.log("ERROR: " + destination + "is not a directory");
				process.exit(1);
			}
		} else {
			fs.mkdirSync(destination);
		}
	}

	function generateProject() {

		if (argv.overwitre) {
			options.overwrite = true;
		}

		tools.generate(argv.template, substitutions, destination, options, function(inError, inData) {
			if (inError) {
				console.log("An error occured, err: " + inError);
				return;
			}

			console.log('DONE: ' + destination);
		});
	}

	function insertProperty(prop, properties) {
		var values = prop.split('=');
		properties[values[0]] = values[1];
	}

	function manageProperties() {
		var properties = {};
		if (argv.property) {
			if (typeof argv.property === 'string') {
				insertProperty(argv.property, properties);
			} else {
				argv.property.forEach(function(prop) {
					insertProperty(prop, properties);
				});
			}
			substitutions.push({ fileRegexp: "appinfo.json", json: properties});
		}
	}

	function checkAndShowHelp() {
		if (argv.help) {
			showUsage();
		}
	}

	function checkAndShowVersion() {
		if (argv.version) {
			console.log("Version: " + pversion);
			process.exit(0);
		}
	}

	function handleDebugOptions() {
		if (argv.debug) {
			console.dir(argv);
			options.verbose = true;
		}
	}

	function loadTemplateList(context, next) {
		tools.registerTemplates([{
				id: "bootplate-2.1.1-local",
				zipfiles: [{
					url: "/Users/yvesdel-medico/GIT/ares-project/templates/projects/bootplate-2.1.1.zip"
				},{
					url: "/Users/yvesdel-medico/GIT/other-templates/webos-app-config.zip"
				}],
				description: "Enyo bootplate 2.1.1 (local)"
			},{
				id: "webos-app",
				zipfiles: [{
					url: "/Users/yvesdel-medico/GIT/other-templates/webos-app-config.zip"
				}],
				description: "Open webOS app no bootplate (local)"
			}
		]);
		next();
	}

	function getTemplateList(context, next) {
		tools.list(function(err, data) {
			if (err) {
				next(err);
				return;
			}
			context.list = [];
			data.forEach(function(template) {
				context.list.push(template);
			});
			next();
		});
	}

	function displayTemplateList(context, err, results) {
		if (err) {
			console.log(err);
			process.exit(1);
		}
		context.list.forEach(function(template) {
			console.log(util.format("%s\t%s", template.id, template.description));
		});

		process.exit(0);
	}

	function listTemplates() {
		var context = {};
		async.series([
				loadTemplateList.bind(this, context),
				getTemplateList.bind(this, context)
			],
			displayTemplateList.bind(this, context));
	}

	function main() {
		checkAndShowHelp();
		checkAndShowVersion();
		handleDebugOptions();

		if (argv.list) {
			listTemplates();
		} else {
			loadTemplateList();
			checkTemplateValid();
			manageProperties();
			checkCreateAppDir();
			generateProject();
		}
	}

	// Execute the commmand
	main();
}());