var shell = require("shelljs"),
    request = require('request'),
    fs = require("fs"),
    util = require('util'),
    path = require("path"),
    async = require("async"),
    unzip = require('unzip'),
    temp = require('temp'),
    mkdirp = require('mkdirp');

(function () {

    var generator = {};

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = generator;
    }

    var objectCounter = 0;

    // Hashmap for available templates
    var templates = {};
    var libs = {};

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

        list: function(type , callback) {
            var listItems = (type === "libs")? libs : templates; 
            var keys = Object.keys(listItems);
            var answer = [];
            keys.forEach(function(key) {
                answer.push(listItems[key]);
            });
            callback(null, answer);
        },

        generate: function(templateId, substitutions, destination, options, callback) {

            if ( ! templates[templateId]) {
                callback("Requested template does not exists", null);
                return;
            }

            // Process all the files
            async.series([
                async.forEachSeries.bind(this, templates[templateId].zipfiles, processZipFile.bind(this)),
                async.forEachSeries.bind(this, (libs[options.addlib])? libs[options.addlib].zipfiles:[], processZipFile.bind(this)),
                performSubstitution.bind(this, substitutions, destination, options)
            ], notifyCaller.bind(this));

            function processZipFile(item, next) {
                if (options.verbose) { console.log("Processing Zip File" + item.url); }

                // Check existence of same named app, overwrite flag, add flag
                this.existed = (options && options.hasOwnProperty('existed'))? options.existed : false;
                this.overwrite = (options && options.hasOwnProperty('overwrite'))? options.overwrite : false; 

                temp.mkdir({prefix: 'com.lg.ares.gen.processZipFile'}, (function(err, tmpDir) {

                async.series([
                        unzipFile.bind(this, item, tmpDir, options),
                        removeExcludedFiles.bind(this, item, tmpDir, options),
                        prefix.bind(this, item, tmpDir, destination, options)
                    ],
                    next);

                }).bind(this));
            }

            function processFile(item, next) {
                if (options.verbose) { console.log("Processing File" + item.url); }

                //TODO: need to verify more.
                var src = item.url,
                    dst = path.join(destination, item.installAs);

                async.series([
                    mkdirp.bind(this, path.dirname(dst)),
                    shell.cp.bind(this, '-rf', src, dst)
                ], next);                

                next();
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
            if (newTemplates.hasOwnProperty('templates') ) {
                newTemplates.templates.forEach(function(entry) {
                    entry.zipfiles.forEach(function(zipfile) {
                        if (zipfile.url.substr(0, 4) !== 'http') {
                            zipfile.url = path.resolve(base, zipfile.url);
                            }
                        });
                    templates[entry.id] = entry;
                });
            } else { /* project-templates which has only template zip files */
                newTemplates.forEach(function(entry) {
                    entry.zipfiles.forEach(function(zipfile) {
                        if (zipfile.url.substr(0, 4) !== 'http') {
                            zipfile.url = path.resolve(base, zipfile.url);
                        }
                    });
                    templates[entry.id] = entry;
                });
            }
            if (newTemplates.hasOwnProperty('libs') ) {
                    newTemplates.libs.forEach(function(entry) {
                        entry.zipfiles.forEach(function(zipfile) {
                            if (zipfile.url.substr(0, 4) !== 'http') {
                                zipfile.url = path.resolve(base, zipfile.url);
                            }
                    });
                    libs[entry.id] = entry;
                });
            }
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

    function prefix(item, srcDir, dstDir, options, next) {
        var src = (item.prefixToRemove)? path.join(srcDir, item.prefixToRemove) : srcDir;
        var dst = (item.prefixToAdd)? path.join(dstDir, item.prefixToAdd) : dstDir;

        if (this.existed && !this.overwrite && fs.existsSync(dst)) {
            if (!item.prefixToAdd) {
                //no prefixToAdd, ignore it to prevent a invalid overwriting.
                next();
                return;
            }
            //find uniqName & change dstDir
            dstDir = path.join(dst, "..");
            var files = fs.readdirSync(dstDir);
            var baseName = path.basename(dst);
            baseName = _findUniqName(files, baseName, 2);
            dst = path.join(dstDir, baseName);          
        
            try {
                if (fs.existsSync(path.join(srcDir, "services.json"))) {
                    _changeIdNameForService(srcDir, baseName, baseName);
                }
            } catch(err) {
                console.error(err);
                next(err);
            }
        }

        async.waterfall([
            mkdirp.bind(this, dst),
            function(data, next) { fs.readdir(src, next); },
            _mv.bind(this)
        ], next);        

        function _mv(files, next) {
            if (options.verbose) { console.log("generate#prefix#_mv()", "files:", files); }
            async.forEach(files, function(file, next) {
                if (options.verbose) { console.log("generate#prefix#_mv()", file + " -> " + dst); }
                fs.rename(path.join(src, file), path.join(dst, file), next);
            }, next);
        }           

        function _findUniqName(namelist, name, concatNum) {
            var uniqName = name + concatNum.toString();
            if(namelist.indexOf(uniqName) >= 0) {
                //TO DO: need to check that concatNum is integer
                return _findUniqName(namelist, name, concatNum+1);
            } else {
                return uniqName;
            }
        }        

        function _changeIdNameForService(servicePath, newId, newName) {
            var serviceInfoFilePath = path.join(servicePath, "services.json");
            try {
                if (!fs.existsSync(serviceInfoFilePath)) {
                    return;
                }

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
    }   

}());
