var fs 		= require('fs'),
    url 	= require("url"),
    util 	= require('util'),
    async 	= require('async'),
    path 	= require('path'),
    log 	= require('npmlog'),
    vm 		= require('vm'),
    shelljs = require('shelljs'),
    mkdirp  = require('mkdirp'),
    sprintf 	= require('sprintf-js').sprintf,
    prjgen 		= require('ares-generator'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    help 		= require('./../lib/helpFormat'),
    errMsgHdlr  = require('./../lib/error-handler'),
    cliAppData  = require('./../lib/cli-appdata');

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

var plugin = {};

/**********************************************************************/

function PalmGenerate() {

	this.configFile  = path.join(path.dirname(process.argv[1]), '../ide-plugin.json');
	this.destination = undefined;
	this.options = {};
	this.substitutions = [];
	this.configGenZip = {};
	this.templatesWithID = {};

	this.defSrcType = 'template';
	this.defEnyoVer = '2.5';
	this.defTmplForVer = 'bootplate-moonstone';
	this.tmplVerFilePath = {
		'bootplate-moonstone': 'templates/bootplate-moonstone/enyo/source/boot/version.js',
		'bootplate-garnet': 'templates/bootplate-garnet/lib/garnet/version.js',
		'bootplate-sunstone': 'templates/bootplate-sunstone/lib/sunstone/version.js'
	};

	var knownOpts = {
		"help": Boolean,
		"hidden-help": Boolean,
		"version": Boolean,
		"list": String,
		"overwrite": Boolean,
		"servicename": String,
		"template": [String, Array],
		"property": [String, Array],
		"file": [String, Array],
		"proxy-url": url,
		"onDevice": String,
		"initialize": Boolean,
		"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
	};
	var shortHands = {
		"h":		"--help",
		"hh": ["--hidden-help"],
		"V":		"--version",
		"l":		"--list",
		"f":		"--overwrite",
		"t":		"--template",
		"p":		"--property",
		"s":		"--servicename",
		"F":		"--file",
		"P":		"--proxy-url",
		"D":		"--onDevice",
		"v":		["--level", "verbose"]
	};
	this.argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
}

PalmGenerate.prototype = {

	initialize: function() {
		this.argv.list = (this.argv.list === 'true') ? this.defSrcType : this.argv.list || false;
		var tmplVerFilePath = path.join(__dirname, '..', this.tmplVerFilePath[this.defTmplForVer]);
		var versionFile = path.join(tmplVerFilePath);
		if (fs.existsSync(versionFile)) {
			try {
				var version = this.getEnyoVersion(versionFile);
				if (version) {
					version = version.split('-')[0];
					this.defEnyoVer = version.split('.').slice(0,2).join('.');
				}
			} catch (err) {
				// In case of causing exception while parsing verion.js, just use the hard-coded default version.
			}
		}
		this.argv.onDevice = (this.argv.onDevice === 'true' || !this.argv.onDevice) ? this.defEnyoVer : this.argv.onDevice;
		this.argv.file = (this.argv.file == 'true' || !this.argv.file) ? [] : this.argv.file;
		this.substituteWords = {
			"@SERVICE-NAME@": this.argv.servicename || "com.yourdomain.app.service",
			"@ENYO-VERSION@": this.argv.onDevice
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
			help.format("\t List the available templates corresponding with TYPE [default: " + this.defSrcType + "]"),
			help.format("\t Available TYPE is 'template', 'webosService', 'appinfo'"),
			"",
			help.format("-p, --property <PROPERTY>", "Set the properties of appinfo.json"),
			help.format(" PROPERTY can be one of the following forms"),
			help.format("win32", "\t (e.g.) -p \"{'id': 'com.examples.helloworld', 'version':'1.0.0', 'type':'web'}\""),
			help.format(["linux", "darwin"], "\t (e.g.) -p '{\"id\": \"com.examples.helloworld\", \"version\":\"1.0.0\", \"type\":\"web\"}'"),
			help.format("\t (e.g.) -p \"id=com.examples.helloworld\" -p \"version=1.0.0\" -p \"type=web\""),
			"",
			help.format("-D, --onDevice <ENYO-VERSION>"),
			help.format("\t ENYO-VERSION is enyo framework version to use [default: " + this.argv.onDevice + "]"),
			help.format("\t This option is applied to 'enyoVersion', 'onDeviceSource' field in appinfo.json"),
			"",
			help.format("-s, --servicename <SERVICENAME>", "Set the servicename for webOS Service"),
			help.format("\t (e.g.) -s \"com.examples.helloworld.service\""),
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
			"",
			"EXAMPLES",
			"",
			"# Create an app with id 'com.domain.app'",
			processName + " -t bootplate-web -p \"id=com.domain.app\" ~/projects/app",
			"",
			"# Create an webOS service named 'com.domain.app.service'",
			processName + " -t webos-service -s com.domain.app.service ~/projects/service",
			""
		];

		this.hiddenhelpString = [
			"",
			"EXTRA-OPTION",
			help.format("--initialize", "Initialize ares-generate command."),
			help.format("", "Make copies of bootplate templates in CLI data directory"),
			"EXAMPLES",
			"",
			"# Initialize ares-generate command",
			processName+" --initialize",
			"",
		];

		log.heading = processName;
		log.level = this.argv.level || 'warn';

		this.existed = false;
	},
	applyDefaultTemplate: function(next) {
		log.info("applyDefaultTemplate");
		var defaultTemplates = this.configGenZip.sources.filter(function(template){
			return (this.defSrcType === template.type && template.isDefault == true);
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
		// check the destination has special charater and white space or not
		if (!(/^[a-zA-Z0-9\.\_\-]*$/.test(path.basename(path.resolve(this.destination))))){
			return next(new Error("Not available AppDir name"));
		}
		// Create the directorie if it does not exist
		if (fs.existsSync(this.destination)) {
			var stats = fs.statSync(this.destination);
			if ( ! stats.isDirectory()) {
				log.error('checkCreateAppDir', "'" + this.destination + "' is not a directory");
				cliControl.end();
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
	checkServiceOption: function(next) {
		var reqGenSvc = false;
		this.argv.template.forEach(function(name) {
			if (this.templatesWithID[name].type.match(/Service/i)) {
				reqGenSvc = true;
			}
		}.bind(this));
		var appinfoPath = path.join(this.destination, 'appinfo.json');
		try {
			if(fs.existsSync(appinfoPath)) {
				var data = fs.readFileSync(appinfoPath);
				var appinfo = JSON.parse(data);
			}
		} catch(err) {
			return next(err);
		}

		//webos-service type template need this.argv.servicename
		if (reqGenSvc) {
//			if (this.argv.servicename) {
				if (appinfo) {
					var svcName = this.substituteWords["@SERVICE-NAME@"];
					if (svcName.indexOf(appinfo.id + ".") === -1) {
						return next(new Error("serivce name '"+ svcName +"' must be subdomain of app id '" + appinfo.id + "'"));
					}
				}
//			} else {
//				return next(new Error("To generate webosService, '-s, --servicename' is needed"));
//			}
		}
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
		} else {
			console.log("Success");
		}
		cliControl.end();
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

	getEnyoVersion: function(versionFilePath) {
		var includeInThisContext = function(path) {
			var code = fs.readFileSync(path);
			code = "var enyo={}; enyo.version=new Object();" + code;
			vm.runInThisContext(code, path);
		};
		includeInThisContext(versionFilePath);
		var version;
		if (typeof enyo.version === 'object' && enyo.version != {}) {
			for (key in enyo.version) {
				if (typeof enyo.version[key] === 'string') {
					version = enyo.version[key];
					break;
				}
			}
		}
		return version;
	},

	getEnyoTemplateVersion: function(searchPath, next) {
		var maxVersion = "";
		var versions = [];
		async.series([
			this.walkFolder.bind(this, searchPath, versions, "version.js"),
			function(next) {
				versions.forEach(function(obj) {
					log.verbose("getEnyoTemplateVersion#file:", obj.path);
					var version;
					try {
						version = this.getEnyoVersion(obj.path);
					} catch (err) {
						//ignore exception
					}
					if (!version)
						version = "";
					maxVersion = (maxVersion < version) ? version : maxVersion;
					log.verbose("getEnyoTemplateVersion#enyo.version[\"" + obj.prop + "\"]", version);
				}.bind(this));
				next();
			}.bind(this)
		], function(err) {
			log.verbose("getEnyoTemplateVersion#maxVersion:", maxVersion);
			next(err, maxVersion);
		});
	},

	displayTemplateList: function(type, readVersionJs, next) {
		log.info("displayTemplateList");
		var templates = this.configGenZip.sources.filter(function(template) {
			return (type === template.type);
		});
		var sourceIds = Object.keys(templates);
		async.forEach(sourceIds, function(sourceId, next) {
			var source = templates[sourceId];
			var version = "";
			async.waterfall([

				function(next) {
					if (!readVersionJs) {
						return next(null, source.version);
					}
					var maxVersion = "";
					async.forEachSeries(source.files, _findMaxVersion.bind(this), function(err) {
						if (err) {
							return next(err);
						}
						next(null, maxVersion || source.version);
					});

					function _findMaxVersion(tmpl, next) {
						if (tmpl.url && tmpl.url.substr(0, 4) !== 'http') {
							if (tmpl.symlink) {
								var symlinkList = Object.keys(tmpl.symlink).map(function(key) {
									return tmpl.symlink[key];
								});
							}
							var checkPaths = [tmpl.url].concat(symlinkList || []);
							var tmplName = Object.keys(this.tmplVerFilePath);
							var exit = false;
							checkPaths.forEach(function(filePath) {
								if (exit) return;
								tmplName.forEach(function(name) {
									if (exit) return;
									if (filePath.indexOf(name) > 0) {
										var verFile = path.join(__dirname, '..', this.tmplVerFilePath[name]);
										if (fs.existsSync(verFile)) {
											try {
												maxVersion = this.getEnyoVersion(verFile);
												exit = true;
											} catch (err) {}
										}
									}
								}.bind(this));
							}.bind(this));
							if (exit) return next();

							async.forEachSeries(checkPaths, function(checkPath, next) {
								var configStats = fs.lstatSync(checkPath);
								if (configStats.isDirectory()) {
									this.getEnyoTemplateVersion(checkPath, function(err, version) {
										maxVersion = (maxVersion < version) ? version : maxVersion;
										next();
									});
								} else {
									next();
								}
							}.bind(this), function(err) {
								if (err) {
									return next(err);
								}
								next();
							});
						} else {
							next();
						}
					}
				}.bind(this)
			], function(err, version) {
				if (err) {
					return next(err);
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
				this.displayTemplateList.bind(this, type, true)
			], (function(err, results) {
				if (err) {
					log.error("*** " + processName + ": "+ err.toString());
					log.verbose(err.stack);
				}
				cliControl.end();
			}).bind(this));
	},

	showUsage: function(hiddenFlag) {
		help.print(this.helpString);
		if (hiddenFlag) {
			help.print(this.hiddenhelpString);
		}
		cliControl.end();
	},

	checkAndShowHelp: function() {
		if (this.argv.help || this.argv['hidden-help']) {
			this.showUsage(this.argv['hidden-help']);
		}
	},

	generateProject: function() {
		log.verbose("generateProject");
		async.series([
				versionTool.checkNodeVersion,
				this.checkTemplateValid.bind(this),
				this.checkCreateAppDir.bind(this),
				this.checkServiceOption.bind(this),
				this.changePluginConfig.bind(this),
				this.getSubstFileListFromConfig.bind(this),
				this.setSubstitutions.bind(this),
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
			this.loadPluginConfig.bind(this, this.configFile), (function(next) {
				if (this.argv.list) {
					this.listSources(this.argv.list);
				} else {
					var initAndExit = this.argv.initialize;
					this.copyBPtoCliData(initAndExit, function(err) {
						if (initAndExit) {
							console.log("Success");
							return cliControl.end();
						}
						next(err);
					});
				}
			}).bind(this),
			this.generateProject.bind(this)
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
			if (source.id && source.type !== null) {
				this.templatesWithID[source.id] = source;
			}
		}.bind(this));
		next();
	},

	copyBPtoCliData: function(reset, next) {
		log.verbose("copyBPtoCliData");
		if (!this.configGenZip) {
			return next(new Error("loadPluginConfig() should be called first"));
		}
		var cliData = cliAppData.create();
		var cliDataPath = cliData.getPath();
		for (tmplName in this.tmplVerFilePath) {
			var tmplVerFilePath = path.join(__dirname, '..', this.tmplVerFilePath[tmplName]);
			var versionFile = path.join(tmplVerFilePath);
			var version;
			if (fs.existsSync(versionFile)) {
				try {
					version = this.getEnyoVersion(versionFile);
				} catch (err) {
					return next();
				}
			} else {
				version = null;
			}
			if (version) {
				var subPath = path.join("templates", version, tmplName);
				var builtinPath = path.join(path.dirname(this.configFile), 'templates', tmplName);
				if (reset && cliData.isExist(subPath)) {
					cliData.remove(subPath);
				}
				if (!cliData.isExist(subPath)) {
					cliData.put(path.join(builtinPath, "*"), subPath);
				}
				var configString = JSON.stringify(this.configGenZip, null, "\t");
				var templatesInAppData = path.join(cliDataPath, subPath);
				configString = configString.replace(new RegExp(builtinPath, "g"), templatesInAppData);
				this.configGenZip = JSON.parse(configString);
			}
		}
		next();
	},

	changePluginConfig: function(next) {
		if (!this.configGenZip) {
			return next(new Error("loadPluginConfig() should be called first"));
		}
		//   Template num >= 2 && Templates contains Template  && webos-service
		//   ||  dst dir is app_dir
		//      change webos-service template dst path (prefixToAdd)
		var appinfoExist = fs.existsSync(path.join(this.destination, 'appinfo.json'));
		var reqGenTemp = false;
		var reqGenSvc = false;
		var svcName;
		var prefixToAdd;
		this.argv.template.forEach(function(name) {
			if (this.templatesWithID[name].type === "template") {
				reqGenTemp = true;
			}
			if (this.templatesWithID[name].type.match(/Service/i)) {
				reqGenSvc = true;
				svcName = name;
			}
		}.bind(this));

		if ( reqGenSvc ) {
			if ( (this.argv.template.length > 1 && reqGenTemp)
			|| appinfoExist  ) {
				prefixToAdd = "services/" + this.substituteWords["@SERVICE-NAME@"];
				this.configGenZip.sources.forEach(function(source) {
					if (source.id === svcName) {
						source.files.forEach(function(filePath){
							filePath.prefixToAdd = prefixToAdd;
						});
					}
				});
			}
		}
		if (appinfoExist && !this.argv.overwrite ) {
			var svcPath = (prefixToAdd)? path.join(this.destination, prefixToAdd) : this.destination;
			if (fs.existsSync(svcPath)) {
				return next(new Error(svcPath + " already exists"));
			} else {
				this.existed = false;
			}
		}
		next();
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
cmd.initialize();
cmd.exec();
