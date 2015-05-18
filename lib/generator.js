/*jshint node: true, strict: false, globalstrict: false */

var fs = require("graceful-fs"),
    util = require('util'),
    request = require('request'),
    path = require("path"),
    log = require('npmlog'),
    async = require("async"),
    mkdirp = require("mkdirp"),
    extract = require("extract-zip"),
    cliData = require('./cli-appdata').create('.ares');
    copyFile = require('./copyFile');

(function () {

	var generator = {};

	if (process.platform === 'win32') {
		generator.normalizePath = function(p) {
			return p && typeof p === 'string' && p.replace(/\\/g,'/');
		};
	} else {
		generator.normalizePath = function(p) {
			return p;
		};
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = generator;
	}

	var objectCounter = 0;

	var isObject = function(a) {
		return (!!a) && (a.constructor === Object);
	};
	var isString = function(a) {
		return (!!a) && (a.constructor === String);
	};

	function Generator(config, next) {
		if (!isObject(config)) {
			setImmediate(next, new Error("Invalid configuration:" + config));
			return;
		}
		if (!Array.isArray(config.sources)) {
			setImmediate(next, new Error("Invalid sources:" + config.sources));
			return;
		}
		this.config = config;
		log.level = config.level || 'http';
		this.objectId = objectCounter++;
		var sources = {};
		try {
			log.silly("Generator()", "Checking config.sources:", config.sources);
			config.sources.forEach(function(source) {
				log.silly("Generator()", "Checking source:", source);
				if ((typeof source.id === 'string') && (source.type === null)) {
					if (sources[source.id]) {
						delete sources[source.id];
						log.verbose("Generator()", "Removed source:", source.id);
					} else {
						log.verbose("Generator()", "No such source to remove '", source.id, "'");
					}
				} else if ((isString(source.id)) && 
				    (isString(source.type)) && 
				    (isString(source.description)) &&
				    (Array.isArray(source.files))) {
					sources[source.id] = source;
					log.verbose("Generator()", "Loaded source:", source);
				} else {
					throw new Error("Incomplete or invalid source:" + util.inspect(source));
				}
			});
		} catch(err) {
			setImmediate(next, err);
			return;
		}
		this.config.sources = sources;

		log.info("Generator()", "config:", util.inspect(this.config, {depth: null}));
		setImmediate(next, null, this);
	}

	generator.Generator = Generator;
	
	generator.create = function(config, next) {
		return new Generator(config, next);
	};

	Generator.prototype = {

		/**
		 * List configuration: sources
		 * @public
		 * @param {String} type source type, in ['template', 'lib', 'webos-service', ...]
		 * @param {Function} next commonJS callback
		 * @param next {Error} err 
		 * @param next {Array} sources
		 * @item sources {Object} id
		 * @item sources {Object} type in ['template', 'lib', 'webos-service', ...]
		 * @item sources {Object} [version]
		 * @item sources {Object} description
		 * @item sources {Object} [deps]
		 */
		getSources: function(type, next) {
			var outSources,
			    sources = this.config.sources,
			    sourceIds = Object.keys(sources);
			sourceIds = sourceIds && sourceIds.filter(function(sourceId) {
				return type && (sources[sourceId].type === type);
			});
			log.verbose("Generator#getSources()", "type:", type, "sourceIds:", sourceIds);
			outSources = sourceIds && sourceIds.map(function(sourceId) {
				var source = sources[sourceId];
				return {
					type: source.type,
					id: source.id,
					version: source.version,
					description: source.description,
					isDefault: source.isDefault || false,
					deps: source.deps || []
				};
			});
			log.silly("Generator#getSources()", "sources:", outSources);
			setImmediate(next, null, outSources);
		},

		generate: function(sourceIds, substitutions, destination, options, next) {
			log.info("generate()", "sourceIds:", sourceIds);
			log.verbose("generate()", "config.sources:", this.config.sources);
			var self = this;
			var session = {
				fileList:[],
				substitutions: substitutions,
				destination: destination
			};
			options = options || {};

			// Enrich the list of option Id's by recursing into the dependencies
			sourceIds = sourceIds || [];
			var sourcesObject = {};
			_addSources(sourceIds);
			function _addSources(sourceIds) {
				log.verbose("generate#_addSources()", "adding sources:", sourceIds);
				sourceIds.forEach((function(sourceId) {
					if (sourcesObject[sourceId]) {
						// option already listed: skip
						return;
					} else {
						// option not yet listed: recurse
						var source = self.config.sources[sourceId];
						log.silly("generate#_addSources()", " sourceId:", sourceId, "=> source:", source);
						if (source) {
							sourcesObject[sourceId] = source;
							source.deps = source.deps || [];
							_addSources(source.deps);
						}
					}
				}));
			}
				
			log.info("generate()", "will use sourceIds:", Object.keys(sourcesObject));

			// now that sources are uniquely identified
			// via object properties, convert them back
			// into an array for iteration.
			var sources = Object.keys(sourcesObject).reverse().map(function(sourceId) {
				return self.config.sources[sourceId];
			});
			
			log.verbose("generate()", "sources:", sources);
			log.info("generate()", "substitutions:", substitutions);

			// Do not overwrite the target directory (as a
			// whole) in case it already exists.
			if (!options.overwrite && fs.existsSync(destination)) {
				setImmediate(next, new Error("'" + destination + "' already exists"));
				return;
			}

			async.series([
				async.forEachSeries.bind(self, sources, _processSource.bind(self)),
				_substitute.bind(self, session)
			], function _notifyCaller(err) {
				if(err) {
					console.log(err);
				}
				next(err);
			});

			function _processSource(source, next) {
				log.silly("generate#_processSource()", "processing source:", source);
				async.forEachSeries(source.files, _processSourceItem.bind(self), next);
			}

			function _processSourceItem(item, next) {
				if (!item.url) {
					// simply ignore entries that
					// do not have (or have a
					// commented...) "url"
					// property.
					setImmediate(next);
					return;
				}
				
				if (item.at || item.prefixToAdd) {
					var at = item.at || item.prefixToAdd;
					item.at = session.destination + "/" + at;
				} else {
					item.at = session.destination;
				}

				if(path.extname(item.url) === '.zip'){
					_processZipFile(item, next);
				} else {
					fs.stat(item.url, function(err, stats){
						if(err){
							next(err);
						} else if (stats.isDirectory()){
							_processFolder(item, next);
						} else if (stats.isFile()){
							_processFile(item, next);
						} else {
							next(new Error("Don't know how to handle '" + item.url + "'"));
						}
					});
				}
			}

			function _processFile(item, next) {
				log.info("generate#_processFile()", "Processing:", item.url);
				var dst = path.join(item.at, path.basename(item.url));
				session.fileList.push({name:path.basename(item.url), path:dst});
				//console.log("[Copying file to " + dst + "]"); 
				async.series([
					mkdirp.bind(null, path.dirname(dst)),
					copyFile.bind(null, item.url, dst)
				], next);	
			}

			function _processFolder(item, next) {
				log.info("generate#_processFolder()", "Processing:", item.url);
				async.waterfall([
					fs.readdir.bind(null, item.url),
					function(fileNames, next){
						async.forEach(fileNames, function(fileName, next){
							var filePath = path.join(item.url, fileName);
							async.waterfall([
								fs.stat.bind(null, filePath),
								function(stat, next){
									if(stat.isFile()){
										var dst = path.join(item.at, fileName);
										session.fileList.push({name:fileName, path:dst});
										//console.log("[Copying file to " + dst + "]"); 
										async.series([
											mkdirp.bind(null, path.dirname(dst)),
											copyFile.bind(null, filePath, dst)
										], next);	
									} else {
										_processFolder({url:item.url+"/"+fileName, at:item.at+"/"+fileName}, next);
									}
								}
							], next);
						}, next);
					}
				], next);
			}

			function _processZipFile(item, next) {
				log.info("generate#_processZipFile()", "Processing:", item.url);
				
				function _rplcItemUrl(next){
					if(item.url.substr(0, 4) === 'http'){
						var builtInPath = path.resolve(path.join(path.dirname(process.argv[1]), '../templates/built-in/')) + path.basename(item.url);
						var downloadPath = path.join(path.join(cliData.getPath(), 'download/'),  path.basename(item.url));

						if(fs.existsSync(builtInPath)){
							item.url = builtInPath;
						} else if (fs.existsSync(downloadPath)){
							item.url = downloadPath;
						} 
					}
					setImmediate(next);
				}
				
				function _fetchFile(next) {
					log.silly("Generator#_fetchFile()");
					try {
						var url = item.url;
						var downloadPath = path.resolve(path.join(cliData.getPath(), 'download/'));

						if (fs.existsSync(url)) {
							setImmediate(next);
							return;
						}
						
						if (url.substr(0, 4) !== 'http') {
							setImmediate(next, new Error("Source '" + url + "' does not exists"));
							return;
						}
						item.url = path.join(downloadPath, path.basename(item.url));

						log.http("Generator#_fetchFile()", "GET", url, "=>", context.archive);
						log.http("Generator#_fetchFile()", "using proxy:", this.config.proxyUrl);
						request({
							url: url,
							proxy: this.config.proxyUrl
						}).pipe(
							fs.createWriteStream(downloadPath).on('close', next)
						);
					} catch(err) {
						log.error("Generator#_fetchFile()", err);
						setImmediate(next, err);
					}
				}
				
				function _extractZip(next){
					var dstDir = item.at;
					log.verbose("generate#_extractZip()", "dstDir:", dstDir);
					if(!dstDir){
						setImmediate(next);
					} else {
						var zipFile = item.url;
						if(!fs.existsSync(zipFile)){
							setImmediate(next, new Error("Cannot find the archive file : " + zipFile));
						} else {
							//console.log("[Extracting archive file to " + dstDir + "/] ... ");
							extract(zipFile, {dir: dstDir}, 
								function(err) {
									return setImmediate(next, err);
								});
						}
					}
				}
	
				async.series([
					_rplcItemUrl.bind(self),
					_fetchFile.bind(self),
					_extractZip.bind(self)
				], next);
			}
		}
	};

	function _substitute(session, next) {
		//log.silly("Generator#_substitute()", "arguments:", arguments);
		var substits = session.substitutions || [];
		log.verbose("_substitute()", "substits:", substits);
		async.forEachSeries(substits, function(substit, next) {
			log.silly("_substitute()", "applying substit:", substit);
			var regexp = new RegExp(substit.fileRegexp);
			var fileList = session.fileList.filter(function(file) {
				log.silly("_substitute()", regexp, "matching? file.name:", file.name);
				return regexp.test(file.name);
			});
			// Thanks to js ref-count system, elements of
			// the subset fileList are also elements of
			// the original input fileList
			async.forEach(fileList, function(file, next) {
				log.verbose("_substitute()", "matched file:", file);
				async.series([
					function(next) {
						if (substit.json) {
							log.verbose("_substitute()", "applying json substitutions to:", file);
							_applyJsonSubstitutions(file, substit.json, substit.add, next);
						} else {
							setImmediate(next);
						}
					},
					function(next) {
						if (substit.vars) {
							log.verbose("_substitute()", "Applying VARS substitutions to", file);
							_applyVarsSubstitutions(file, substit.vars, next);
						} else {
							setImmediate(next);
						}
					},
					function(next) {
						if (substit.regexp) {
							log.verbose("_substitute()", "Applying Regexp substitutions to", file);
							_applyRegexpSubstitutions(file, substit.regexp, next);
						} else {
							setImmediate(next);
						}
					}
				], function(err) {
					next(err);
				});
			}, next);
		}, next);
		
		function _applyJsonSubstitutions(file, json, add, next) {
			log.verbose("_applyJsonSubstitutions()", "substituting json:", json, "in", file);
			async.waterfall([
				fs.readFile.bind(null, file.path, {encoding: 'utf8'}),
				function(content, next) {
					log.silly("_applyJsonSubstitutions()", "loaded JSON string:", content);
					content = JSON.parse(content);
					log.silly("_applyJsonSubstitutions()", "content:", content);
					var modified, keys = Object.keys(json);
					keys.forEach(function(key) {
						if (content.hasOwnProperty(key) || (add && add[key])) {
							log.verbose("_applyJsonSubstitutions()", "apply", key, ":", json[key]);
							content[key] = json[key];
							modified = true;
						}
					});
					log.silly("_applyJsonSubstitutions()", "modified:", modified, "content:", content);
					if (modified) {
						log.silly("_applyJsonSubstitutions()", "update as file:", file);
						fs.writeFile(file.path, JSON.stringify(content, null, 2), {encoding: 'utf8'}, next);
					} else {
						setImmediate(next);
					}
				}
			], next);
		}

		function _applyVarsSubstitutions(file, changes, next) {
			log.verbose("_applyVarsSubstitutions()", "substituting variables in", file);
			async.waterfall([
				fs.readFile.bind(null, file.path, {encoding: 'utf-8'}),
				function(content, next) {
					Object.keys(changes).forEach(function(key) {
						var value = changes[key];
						log.silly("_applyVarsSubstitutions()", "key=" + key + " -> value=" + value);
						content = content.replace("${" + key + "}", value);
					});
					fs.writeFile(file.path, content, {encoding: 'utf8'}, next);
				}
			], next);
		}

		function _applyRegexpSubstitutions(file, changes, next) {
			log.verbose("_applyRegexpSubstitutions()", "substituting word in", file);
			async.waterfall([
				fs.readFile.bind(null, file.path, {encoding: 'utf-8'}),
				function(content, next) {
					Object.keys(changes).forEach(function(key) {
						var value = changes[key];
						log.silly("_applyRegexpSubstitutions()", "regexp=" + key + " -> value=" + value);
						var regExp = new RegExp(key, "g");
						content = content.replace(regExp, value);
					});
					fs.writeFile(file.path, content, {encoding: 'utf8'}, next);
				}
			], next);
		}
	}
}());
