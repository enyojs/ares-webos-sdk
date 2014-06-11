var fs 		= require("fs"),
    url 	= require("url"),
    util 	= require('util'),
    async 	= require('async'),
    path 	= require('path'),
    log 	= require('npmlog'),
    vm 		= require("vm"),
    sprintf 	= require('sprintf').sprintf,
    prjgen 		= require('ares-generator'),
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    help 		= require('./../lib/helpFormat'),
    errMsgHdlr  = require('./../lib/error-handler');

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
	this.configGenZip = {};
	this.templatesWithID = {};

	this.defaultSourceType = 'template';
	this.defaultEnyoVersion = '2.3.0';

	var knownOpts = {
		"help":		Boolean,
		"version":	Boolean,
		"list":		String,
		"overwrite":	Boolean,
		"template":	[String, Array],
		"property":	[String, Array],
		"file":	[String, Array],
		"proxy-url":	url,
		"onDevice": String,
		"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error']
	};
	var shortHands = {
		"h":		"--help",
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"F":		"--file",
		"P":		"--proxy-url",
		"D":		"--onDevice",
		"v":		["--level", "verbose"]
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	this.argv.list = (this.argv.list === 'true')? this.defaultSourceType:this.argv.list || false;
	this.argv.onDevice = (this.argv.onDevice === 'true' || !this.argv.onDevice)? this.defaultEnyoVersion:this.argv.onDevice;
	this.argv.file = (this.argv.file == 'true' || !this.argv.file)? []:this.argv.file;
	var basename = "";
	if (this.argv.argv.remain.length > 0) {
		var appDir = this.argv.argv.remain[0];
		appDir = (fs.existsSync(appDir))? fs.realpathSync(appDir) : appDir;
		basename = path.basename(appDir);
		if (basename) {
			var dirNameArry = basename.split('.');
			switch (dirNameArry.length) {
				case 2:
					if (dirNameArry[0] == "com") {
						dirNameArry.splice(1, 0, "yourdomain");
					} else {
						dirNameArry.splice(0, 0, "com");
					}
					break;
				case 1:
					dirNameArry.splice(0, 0, "com.yourdomain");
					break;
				default:
					break;
			}
			basename = dirNameArry.join(".");
		}
	}
	this.configFileSubstitutions = {
		"@ID@": basename,
		"@SERVICE-NAME@": basename + ".service"
	};
	this.substituteWords = {
		"@ID@": basename,
		"@SERVICE-NAME@": basename + ".service",
		"@ENYO-VERSION@":this.argv.onDevice
	};
	this.helpString = [
		"",
		"NAME",
		help.format(processName + " - Create webOS app projects from templates"),
		"",
		"SYNOPSIS",
		help.format(processName + " [OPTION...] <APP_DIR>"),
		help.format("\t APP_DIR is the application directory. It will be created if it does not exist."),
		"",
		"OPTION",
		help.format("-t,--template <TEMPLATE>", "specify TEMPLATE to use"),
		help.format("", "TEMPLATE can be listed via " + processName + " --list, -l"),
		"",
		help.format("-l, --list <TYPE>"),
		help.format("\t List the available templates corresponding with TYPE [default: " + this.defaultSourceType + "]"),
		help.format("\t Available TYPE is 'template', 'webosService', 'appinfo'"),
		"",
		help.format("-p, --property <PROPERTY>", "Set the properties of appinfo.json"),
		help.format(" PROPERTY can be one of the following forms"),
		help.format("win32",            "\t (e.g.) -p \"{'id': 'com.examples.helloworld', 'version':'1.0.0', 'type':'web'}\""),		
		help.format(["linux","darwin"], "\t (e.g.) -p '{\"id\": \"com.examples.helloworld\", \"version\":\"1.0.0\", \"type\":\"web\"}'"),
		help.format("\t (e.g.) -p \"id=com.examples.helloworld\" -p \"version=1.0.0\" -p \"type=web\""),
		"",
		help.format("-D, --onDevice <ENYO-VERSION>"),
		help.format("\t ENYO-VERSION is enyo framework version to use [default: " + this.defaultEnyoVersion + "]"),
		help.format("\t This option is applied to 'enyoVersion', 'onDeviceSource' field in appinfo.json"),
		"",
		help.format("-f, --overwrite", "Overwrite existing files [boolean]"),
		help.format("--level <LEVEL>", "Tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
		help.format("-h, --help", "Display this help"),
		help.format("-V, --version", "Display version info"),
//		help.format("--proxy-url, -P", "Use the given HTTP/S proxy URL [url]"),
		"",
		"DESCRIPTION",
		"",
		help.format("PROPERTY defines properties to be used during generation."),
		help.format("Properties can be specified as key-value pairs of the form \"key=value\""),
		help.format("or as JSON objects of the form '{\"key1\":\"value1\", \"key2\":\"value2\", ...}'."),
		help.format("Surrounding quotes are required in both cases."),
		""
	];

	log.heading = processName;
	log.level = this.argv.level || 'warn';

	this.existed = false;
}

PalmGenerate.prototype = {

	applyDefaultTemplate: function(next) {
		log.info("applyDefaultTemplate");
		var defaultTemplates = this.configGenZip.sources.filter(function(template){
			return (this.defaultSourceType === template.type && template.isDefault == true);
		}.bind(this));
		if (defaultTemplates.length < 1) {
			return next(new Error("failed to get a default template name, please specify the template name"));
		}
		this.argv.template = [defaultTemplates[0].id];
		next();
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
		if (this.configGenZip.sources.length === 0) {
			return next(new Error("Not available templates..."));
		} else {
			this.argv.template.forEach(function(name) {
				if (!this.templatesWithID[name]) {
					return next(new Error("Not available template named " + name));
				}
			}.bind(this));
		}
		next();
	},

	checkCreateAppDir: function(next) {
		log.info("checkCreateAppDir");
		// Verify we have an APP_DIR parameter
		if (this.argv.argv.remain.length < 1) {
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

	getSubstFileListFromConfig: function(next) {
		var reqTemplates = this.argv.template;
		reqTemplates.forEach(function(name) {
			configSource = this.templatesWithID[name];
			if (configSource.deps) {
				configSource.deps.forEach(function(subSource) {
					_addSubstFile(this.argv.file, this.templatesWithID[subSource]);
				}.bind(this));
			}
			_addSubstFile(this.argv.file, configSource);

			function _addSubstFile(substFiles, configSourceItem) {
				var files = configSourceItem.filesubstitution;
				if (files) {
					files.forEach(function(file) {
						substFiles.push(file);
					});
				}
			}
		}.bind(this));
		next();
	},

	setSubstitutions: function(next) {
		var self = this;
		var propertyFiles;
		if (this.argv.file instanceof Array) {
			propertyFiles = this.argv.file;
		} else {
			propertyFiles = [this.argv.file];
		}

		async.forEachSeries(propertyFiles, function(file, next) {
			self.manageProperties(file, next);
		}, function(err) {
			next(err);
		});
	},

	instantiateProject: function(next) {
		log.info("instantiateProject");
		if (this.argv.overwrite || !this.existed) {
			this.options.overwrite = true;
		}
		console.log("Generating " + this.argv.template + " in " + this.destination);
		var sources = (this.argv.template instanceof Array)? this.argv.template : [this.argv.template];
		this.generator.generate(sources, this.substitutions, this.destination, this.options, next);
	},

	refineJsonString: function(str) {
		//FIXME: this is temporary implementation. need to verify more.
		var refnStr = str;
		var reg = /^['|"](.)*['|"]$/;
		if (reg.test(refnStr)) {
			refnStr = refnStr.substring(1, str.length-1);
		}
		reg = /^{(.)*}$/;
		if (!reg.test(refnStr)) {
			//is not JSON string
			return str;
		}
		if (refnStr.indexOf("\"") === -1) {
			return refnStr.replace(/\s*"/g, "")
	 				.replace(/\s*'/g, "")
	 				.replace("{", "{\"")
	 				.replace("}","\"}")
	 				.replace(/\s*,\s*/g, "\",\"")
	 				.replace(/\s*:\s*/g, "\":\"");
		} else {
			return refnStr.replace(/\s*'/g, "\"");
		}
	},

	isJson: function(str) {
		try {
			JSON.parse(str);
		} catch(err) {
			return false;
		}
		return true;
	},

	insertProperty: function(properties, prop) {
		var values = prop.split('=');
		if (values.length != 2) {
			return;
		}
		properties[values[0]] = values[1];
		log.info("Inserting property " + values[0] + " = " + values[1]);
	},

	manageProperties: function(file, next) {
		log.info("manageProperties");
		var properties = {};
		file = file.replace(/\*/g, "").replace(/$/g,"$");
		var substitution = { fileRegexp: file };
		if (this.argv.property) {
			var arryProperties= [].concat(this.argv.property);
			arryProperties.forEach(function(prop) {
				var jsonFromArgv = this.refineJsonString(prop);
				if (this.isJson(jsonFromArgv)) {
					properties = JSON.parse(jsonFromArgv);
				} else {
					this.insertProperty(properties, prop);
				}
			}, this);

			//Currently property options is proper for substitution of appinfo.json
			if (file.match(/appinfo.json/gi)) {
				//substitution for json
				substitution.json = properties;
				substitution.add = {};
				for (key in properties) {
					substitution.add[key] = true;
				}
			}
			//property option can be used for substitution of string
			for (propKey in properties) {
				var word = "@"+propKey.toUpperCase()+"@";
				var value = properties[propKey];
				this.substituteWords[word] = properties[propKey];
				this.configFileSubstitutions[word] = properties[propKey];

				//FIXME: hard coded for webos-service tempalte source substitutions
				if (word === "@ID@") {
					var serviceName = properties[propKey];
					if (!properties[propKey].match(/.service$/g)) {
						serviceName = serviceName.concat(".service");
					} 
					this.substituteWords["@SERVICE-NAME@"] = serviceName;
					this.configFileSubstitutions["@SERVICE-NAME@"] = serviceName;					
				}
			}
		}
		//substitution for string
		substitution.regexp = this.substituteWords;
		this.substitutions.push(substitution);
		next();
	},

	projectReady: function(err, results) {
		log.info("projectReady", "err:", err, "results:", results);
		if (err) {
			log.error(processName + ": "+ errMsgHdlr.changeErrMsg(err));
			log.verbose(err.stack);
			process.exit(1);
		}
		console.log("Success");
		process.exit(0);
	},

	walkFolder: function(dirPath, getArray, name, next) {
		async.waterfall([
			fs.readdir.bind(this, dirPath),
			function(fileNames, next) {
				async.forEach(fileNames, function(fileName, next) {
					var filePath = path.join(dirPath, fileName);
					async.waterfall([
						fs.lstat.bind(this, filePath),
						function(stat, next) {
							if (stat.isFile()) {
								if (fileName === name) {
									var fp = path.join(dirPath, fileName);
									var dirName = path.basename(path.dirname(fp));
									var obj = {
										prop: dirName,
										path: fp
									};
									getArray.push(obj);
								}
								next();
							} else if (stat.isDirectory()) {
								this.walkFolder(filePath, getArray, name, next);
							} else {
								next();
							}
						}.bind(this)
					], next); // async.waterfall
				}.bind(this), next); // async.forEach
			}.bind(this)
		], function(err) {
			next(err);
		});
	},

	getEnyoTemplateVersion: function(searchPath, next) {
		var includeInThisContext = function(path) {
		    var code = fs.readFileSync(path);
		    code = "var enyo={}; enyo.version=new Object();" + code;
		    vm.runInThisContext(code, path);
		}.bind(this);

		var maxVersion = "";
		var versions = [];
		async.series([
		    this.walkFolder.bind(this, searchPath, versions, "version.js")
		], function(err, results) {
		    versions.forEach(function(obj) {
		        log.verbose("getEnyoTemplateVersion#file:", obj.path);
		        includeInThisContext(obj.path);
		        var version;
		        if (typeof enyo.version === 'object' && enyo.version != {}) {
		            for (key in enyo.version) {
		                if (typeof enyo.version[key] === 'string') {
		                    version = enyo.version[key];
		                    break;
		                }
		            }
		        }
		        if (!version)
		            version = "";
		        maxVersion = (maxVersion < version) ? version : maxVersion;
		        log.verbose("getEnyoTemplateVersion#enyo.version[\"" + obj.prop + "\"]", version);
		    });
		    log.verbose("getEnyoTemplateVersion#maxVersion:", maxVersion);
		    next(null, maxVersion);
		});
	},

	displayTemplateList: function(type, next) {
		log.info("displayTemplateList");
		var templates = this.configGenZip.sources.filter(function(template){
			return (type === template.type);
		});
		var sourceIds = Object.keys(templates);
		async.forEach(sourceIds, function(sourceId, next) {
			var source = templates[sourceId];
			var version = "";
			async.waterfall([
				function(next) {
					if (source.files && source.files[0].url && source.files[0].url.substr(0, 4) !== 'http') {
						var configStats = fs.lstatSync(source.files[0].url);
						if (configStats.isDirectory()) {
							this.getEnyoTemplateVersion(source.files[0].url, next);
						} else {
							next();
						}
					} else {
						next();
					}
				}.bind(this)
			], function(err, result) {
				var version = source.version;
				if (err) {
					return next(err);
				}
				if (result) {
					version = result;
				}
				console.log(sprintf("%-40s\t%-10s\t%s %s", source.id, version, source.description, source.isDefault ? "(default)" : ""));
				next();
			});
		}.bind(this), function(err) {
			next(err);
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
		help.print(this.helpString);
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
				this.checkTemplateValid.bind(this),
				this.checkCreateAppDir.bind(this),
				this.getSubstFileListFromConfig.bind(this),
				this.setSubstitutions.bind(this),
				this.substituteConfigGenZip.bind(this),
				this.loadGenerator.bind(this),
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
		configContent = configContent.replace(/@PLUGINDIR@/g, path.dirname(this.configFile).replace(/\\/g,'/'));
		try {
			var plugin = JSON.parse(configContent);
		} catch(e) {
			throw "Improper JSON: "+configContent;
		}
		if (!plugin.services || !plugin.services[0]) {
			throw "Corrupted '"+configFile+"': no services defined";
		}
		plugin.services = plugin.services.filter(function(service){
			return service.hasOwnProperty('sources');
		});
		this.configGenZip = plugin.services[0];
		plugin.services[0].sources.forEach(function(source){
			if (source.id && source.type != null) {
				this.templatesWithID[source.id] = source;
			}
		}.bind(this));
		next();
	},

	substituteConfigGenZip: function(next) {
		log.info("substituteConfigGenZip");
		try {
			configGenZipString = JSON.stringify(this.configGenZip);
			for(key in this.configFileSubstitutions) {
				var regexp = new RegExp(key, "g");
				configGenZipString = configGenZipString.replace(regexp, this.configFileSubstitutions[key]);
			}
			this.configGenZip = JSON.parse(configGenZipString);
			next();
		} catch(err) {
			next(err);
		}
	},

	loadGenerator: function(next) {
		log.info("loadGenerator");
		var genConfig = {
			level: log.level,
			proxyUrl: this.argv["proxy-url"]
		};
		genConfig = util._extend(genConfig, this.configGenZip);
		this.generator = new prjgen.Generator(genConfig, next);
	}
};

// Main
var cmd = new PalmGenerate();
cmd.exec();
