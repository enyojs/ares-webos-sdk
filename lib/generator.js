var shell = require("shelljs"),
    request = require('request'),
    fs = require("fs"),
    util = require('util'),
    path = require("path"),
    async = require("async"),
    unzip = require('unzip');

(function () {

    var generator = {};

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = generator;
    }

    var objectCounter = 0;

    // Hashmap for available templates
    var templates = {};

    function Generator() {
        this.objectId = objectCounter++;
    }

    generator.Generator = Generator;

    Generator.prototype = {

        /**
         * registerTemplates allow to add new templates to the list
         * of available templates
         * @param {Array} newTemplates: array of local templates to add.
         * Entries must have 'id', 'url' and 'description' properties.
         * @public
         */
        registerTemplates: function(newTemplates) {
            newTemplates.forEach(function(entry) {
                templates[entry.id] = entry;
            });
        },

        /**
         * registerRemoteTemplates allows to fetch templates definition
         * thru http
         * @param  {string}   templatesUrl an http url referencing a json file
         * which contains a array of entries a 'id', 'url' and 'description' properties.
         * @param  {Function} callback(err, status)     commonjs callback. Will be invoked with an error
         *               or a json array of generated filenames.
         * @public
         */
        registerRemoteTemplates: function(templatesUrl, callback) {

            if (templatesUrl.substr(0, 4) === 'http') {
                // Issue an http request to get the template definition
                request(templatesUrl, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        parseInsertTemplates(body, templatesUrl, callback);
                    } else if (error) {
                        callback("Unable to retrieve remote template definition. error=" + error);
                    } else if (response && response.statusCode >= 300) {
                        callback("Unable to retrieve remote template definition. status code=" + response.statusCode);
                    } else {
                        // Should not be an error case
                    }
                });
            } else {
                fs.readFile(templatesUrl, function(err, data) {
                    if (err) {
                        callback("Unable to read '" + templatesUrl + "' err: " + err);
                        return;
                    }
                    parseInsertTemplates(data, templatesUrl, callback);
                });
            }
        },

        list: function(callback) {
            var keys = Object.keys(templates);
            var answer = [];
            keys.forEach(function(key) {
                answer.push(templates[key]);
            });
            callback(null, answer);
        },

        generate: function(templateId, substitutions, destination, options, callback) {

            if ( ! templates[templateId]) {
                callback("Requested template does not exists", null);
                return;
            }

            // Process all the files
            async.forEachSeries(templates[templateId].zipfiles, processZipFile, notifyCaller);

            function processZipFile(item, next) {
                if (options.verbose) { console.log("Processing " + item.url); }

                // Check existence of destination
                this.existed = (options && options.hasOwnProperty('existed'))? options.existed : false;
                this.overwrite = (options && options.hasOwnProperty('overwrite'))? options.overwrite : false; 
                this.createservice = (options && options.hasOwnProperty('add-service'))? options['add-service'] : false;

                if(this.existed && !this.overwrite) {
                    if (options.verbose) { console.log("skip unzipFile because app is already existed"); }

                    if(item.hasOwnProperty('serviceTemplate') && this.createservice === true) {
                        async.series([
                                unzipFile.bind(this, item, destination, options),
                                applyService.bind(this, item, destination, options)
                            ], 
                            next);
                    } else {
                        next();
                    }
                } else {
                    async.series([
                            unzipFile.bind(this, item, destination, options),
                            removeExcludedFiles.bind(this, item, destination, options),
                            removePrefix.bind(this, item, destination, options),
                            performSubstitution.bind(this, substitutions, destination, options),
                            applyService.bind(this, item, destination, options)
                        ],
                        next);
                }
            }

            function notifyCaller(err) {
                if (err) {
                    callback(err, null);
                    return;
                }

                // Return the list of extracted files
                var filelist = shell.find(destination);
                callback(null, filelist);
            }
        }
    };

    // Private functions
    
    function parseInsertTemplates(data, templatesUrl, callback) {
        try {
            var newTemplates = JSON.parse(data);

            var base = (templatesUrl.substr(0, 4) !== 'http') && path.dirname(templatesUrl);

            newTemplates.forEach(function(entry) {

                entry.zipfiles.forEach(function(zipfile) {
                    if (zipfile.url.substr(0, 4) !== 'http') {
                        zipfile.url = path.resolve(base, zipfile.url);
                    }
                });

                templates[entry.id] = entry;
            });
            callback(null, {done: true});
        } catch(err) {
            callback("Unable to parse remote template definition data='" + data.toString() + "' url='" + templatesUrl + "' error=" + err);
        }
    }

    function unzipFile(item, destination, options, next) {
        var source = item.url;

        if ((source.substr(0, 4) !== 'http') && ( ! fs.existsSync(source))) {
            if (item.alternateUrl) {
                source = item.alternateUrl;
            } else {
                next("ERROR: file '" + source + "' does not exists");
                return;
            }
        }

        if (options.verbose) { console.log("Unzipping " + source + " to " + destination); }

        // Create an extractor to unzip the template
        var extractor = unzip.Extract({ path: destination });
        extractor.on('error', function(err) {
            next("Extractor ERROR: err=" + err);
        });

        // Building the zipStream either from a file or an http request
        var zipStream;
        if (source.substr(0, 4) === 'http') {
            zipStream = request(source);
        } else {
            zipStream = fs.createReadStream(source);
        }

        // Pipe the zipped content to the extractor to actually perform the unzip
        zipStream.pipe(extractor);

        // Wait for the end of the extraction
        extractor.on('close', function () {
            next();     // Everything went fine
        });
        extractor.on('error', function (err) {
            next(err);  // Something went wrong
        });
    }

    function removeExcludedFiles(item, destination, options, next) {
        if (item.excluded) {            // TODO: move to asynchronous processing
            if (options.verbose) { console.log("removing excluded files"); }

            shell.ls('-R', destination).forEach(function(file) {

                item.excluded.forEach(function(pattern) {
                    var regexp = new RegExp(pattern);
                    if (regexp.test(file)) {
                        if (options.verbose) { console.log("removing: " + file); }
                        var filename = path.join(destination, file);
                        shell.rm('-rf', filename);
                    }
                });
            });

            next();
        } else {
            next();             // Nothing to do
        }
    }

    function removePrefix(item, destination, options, next) {
	    try {
		    if (item.prefixToRemove) {
			    if (options.verbose) { console.log("removing prefix: " + item.prefixToRemove); }
			    
			    var source = path.join(destination, item.prefixToRemove);
			    shell.ls(source).forEach(function(file) {
				    var target = path.join(source, file);
				    //shell.mv(target, destination);    // replace with `cp & rm` instead of `mv`
                    shell.cp('-rf',target, destination);                    
                    shell.rm('-rf',target);
			    });
			    
			    next();
		    } else {
			    next();	// Nothing to do
		    }
	    } catch(err) {
		    next(err);
	    }
    }

    function performSubstitution(substitutions, destination, options, next) {
        if (options.verbose) { console.log("performing substitutions"); }

        // Apply the substitutions                  // TODO: move to asynchronous processing
        if (substitutions) {
            shell.ls('-R', destination).forEach(function(file) {

                substitutions.forEach(function(substit) {
                    var regexp = new RegExp(substit.fileRegexp);
                        if (regexp.test(file)) {
                        var filename = path.join(destination, file);
                        if (substit.json) {
                            if (options.verbose) { console.log("Applying JSON substitutions to: " + file); }
                            applyJsonSubstitutions(filename, substit.json);
                        }
                        if (substit.sed) {
                            if (options.verbose) { console.log("Applying SED substitutions to: " + file); }
                            applySedSubstitutions(filename, substit.sed);
                        }
                    }
                });
            });
        }

        next();
    }

    function applyJsonSubstitutions(filename, values) {
	    try {
		    var modified = false;
		    var content = shell.cat(filename);
		    content = JSON.parse(content);
		    var keys = Object.keys(values);
		    keys.forEach(function(key) {
			    if (content.hasOwnProperty(key)) {
				    // console.log("JSON change >>" + key + "<< to >>" + values[key]+ "<<");
				    content[key] = values[key];
				    modified = true;
			    }
		    });
		    if (modified) {
			    var newContent = JSON.stringify(content, null, 2);
			    fs.writeFileSync(filename, newContent);         // TODO: move to asynchronous processing
		    }
	    } catch(err) {
		    console.err("***" + err.toString());
	    }
    };

    function applySedSubstitutions(filename, changes) {
	    changes.forEach(function(change) {                  // TODO: move to asynchronous processing
		    try {
			    shell.sed('-i', change.search, change.replace, filename);
		    } catch(err) {
			    console.err("*** error applying sed='" + changes + "' to file='" + filename + "': " + err.toString());
		    }
	    });
    };

    function applyService(item, destination, options, next) {
        if (options.verbose) { console.log("apply service option"); }

        try {
            if (item.hasOwnProperty('serviceTemplate') ) {
                if (this.createservice) {
                    var files = fs.readdirSync(destination);
                    var svcDst = path.join(destination, 'services');
                    var svcTmplSrc = path.join(destination, item.serviceTemplate);
                    if (files.indexOf('services') < 0 ) {
                        //mkdir services & mv item.serviceTemplate into services
                        fs.mkdirSync(svcDst);
                    }
                    else {
                        //readdir in services
                        files = fs.readdirSync(svcDst);
                        if (files.indexOf(item.serviceTemplate) >= 0) {
                            //duplicated name exist, so need to find new name
                            var newDirName = findUniqName(files, item.serviceTemplate, 2);
                            svcDst = path.join(svcDst, newDirName);
                            //change services.json to have a proper ID, Name
                            changeIdNameForService(svcTmplSrc, newDirName, newDirName);
                        }
                    }
                    shell.mv(svcTmplSrc, svcDst);
                } else {
                    var rmDir = path.join(destination, item.serviceTemplate);
                    shell.rm('-rf', rmDir);
                }
            } 
            next();
        } catch(err) {
            next(err);
        }
    }

    function findUniqName(namelist, name, concatNum) {
        var uniqName = name + concatNum.toString();
        if(namelist.indexOf(uniqName) >= 0) {
            //TO DO: need to check that concatNum is integer
            return findUniqName(namelist, name, concatNum+1);
        } else {
            return uniqName;
        }
    }

    function changeIdNameForService(servicePath, newId, newName) {
        var serviceInfoFilePath = path.join(servicePath, "services.json");
        try {
            var data = fs.readFileSync(serviceInfoFilePath);
            var serviceInfo = JSON.parse(data);
            if (serviceInfo.hasOwnProperty('id')) {
                serviceInfo.id = newId;
            }
            if (serviceInfo.hasOwnProperty('services')) {
                serviceInfo.services.forEach(function(service) {
                    if (service.hasOwnProperty('name')) {
                        service.name = newName;
                    }
                });
            }
            data = JSON.stringify(serviceInfo, null, 2);
            fs.writeFileSync(serviceInfoFilePath, data);
        } catch(err) {
            console.error(err);
        }        
    }

}());