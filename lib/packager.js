var fs = require("fs"),
    util = require('util'),
    path = require('path'),
    shelljs = require('shelljs'),
    mkdirp = require('mkdirp'),
    temp = require("temp"),
    zlib = require('zlib'),
    tarFilterPack = require('./tar-filter-pack'),
    rimraf = require("rimraf"),
    fstream = require('fstream'),
    spawn = require('child_process').spawn,
    async = require('async'),
    CombinedStream = require('combined-stream'),
    Rsync = require('rsync'),
    npmlog = require('npmlog'),
    Validator = require('jsonschema').Validator;

(function () {
    var log = npmlog;
    log.heading = 'packager';
    log.level = 'warn';

    var servicePkgMethod = 'id';

    // Aliases for location to on-device sources to be used in appinfo.json onDeviceSource paths
    var onDeviceSourceAliases = {
        "$frameworks": "/usr/palm/frameworks",
        "$enyo-framework": "/usr/palm/frameworks/enyo"
    };

    // appinfo.json fields that are only used by the packager, and can be removed from the on-device version
    var packagerOnlyFields = {
        "onDeviceSource": true,
        "additionalHtmlFiles": true,
        "assets": true,
        "exclude": true
    };

    var containerField = {
        "containerJS": true,
        "containerCSS": true
    };

    var defaultAssetsFields = {
        "main": true,
        "icon": true,
        "largeIcon": true,
        "bgImage": true,
        "splashBackground": true,
        "imageForRecents": true
    };

    var packager = {};

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = packager;
    }

    var objectCounter = 0;

    function Packager(options) {
        this.objectId = objectCounter++;
        this.verbose = false;
        this.silent = true;
        if (options && options.level) {
            log.level = options.level;
            if (['warn', 'error'].indexOf(options.level) !== -1) {
                this.silent = false;
            }
        }
        this.noclean = false;
        if (options && options.noclean === true) {
            this.noclean = true;
        }
        this.nativecmd = false;
        if (options && options.nativecmd === true) {
            this.nativecmd = true;
        }
        this.minify = true;
        if (options && options.hasOwnProperty('minify')) {
            this.minify = options.minify;
        }
        if (options && options.hasOwnProperty('deployscript')) {
            this.deployscript = options.deployscript;
        }
        if (options && options.hasOwnProperty('deploy-enyo')) {
            this['deploy-enyo'] = options['deploy-enyo'];
        }
        if (options && options.hasOwnProperty('deploy-lib')) {
            this['deploy-lib']  = options['deploy-lib'];
        }
        if (options && options.hasOwnProperty('deploy-srcroot')) {
            this['deploy-srcroot']  = options['deploy-srcroot'];
        }
        this.excludeFiles = [];
        if (options && options.hasOwnProperty('excludefiles')) {
            if(options.excludefiles instanceof Array) {
                this.excludeFiles = options.excludefiles;
            }
            else {
                this.excludeFiles.push(options.excludefiles);
            }
        }
        this.rom = false;
        if (options && options.hasOwnProperty('rom')) {
            this.rom = options.rom;
        }
        log.verbose("Xtor Packager id=" + this.objectId);
        this.appCount = 0;
        this.services = [];
        this.pkgServiceNames = [];
    }

    packager.Packager = Packager;

    Packager.prototype = {

        checkInputDirectories: function(inDirs, options, next) {
            log.verbose("checkInputDirectories: " + inDirs);
            async.forEachSeries(inDirs, checkDirectory.bind(this, options),
                function(err, results) {
                    if (err) {
                        setImmediate(next, err);
                        return;
                    }

                    if (!options.force) {
                        // TODO: probably some more checkings are needed
                        if (this.appCount === 0) {
                            setImmediate(next, "ERROR: At least an APP_DIR must be specified");
                            return;
                        }
                    }
                    setImmediate(next);
                }.bind(this));
        },

        generatePackage: function(inDirs, destination, options, next) {
            log.verbose("generatePackage: from " + inDirs);
            // check whether app or service directories are copied or not
            this.dataCopyCount = 0;
            async.series([
                    this.checkInputDirectories.bind(this, inDirs, options),
                    loadAppInfo.bind(this),
                    checkAppInfo.bind(this),
                    fillAssetsField.bind(this),
                    createTmpDir.bind(this),
                    createAppDir.bind(this),
                    minifyApp.bind(this),
                    copyAssets.bind(this),
                    copyApp.bind(this),
                    excludeIpkFileFromApp.bind(this),
                    rewriteAppInfo.bind(this),
                    rewriteAppJS.bind(this),
                    rewriteSourcePaths.bind(this),
                    createPackageDir.bind(this),
                    fillPackageDir.bind(this),
                    findServiceDir.bind(this, this.services),
                    loadServiceInfo.bind(this),
                    checkServiceInfo.bind(this),
                    createServiceDir.bind(this),
                    copyService.bind(this),
                    addServiceInPkgInfo.bind(this),
                    removeServiceFromAppDir.bind(this),
                    copyData.bind(this, inDirs, options.force),
                    loadPackageProperties.bind(this),
                    excludeFromApp.bind(this),
                    outputPackage.bind(this, destination, options.pkgname, options.pkgversion),
                    cleanupTmpDir.bind(this)
                ], function(err, results) {
                    if (err) {
                        // TODO: call cleanupTmpDir() before returning
                        setImmediate(next, err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    setImmediate(next, null, {ipk: this.ipk, msg: "Success"});
                }.bind(this));
        }
    };

    function Service() {
        this.srcDir = "";
        this.dstDirs = [];
        this.valid = false;
        this.serviceInfo = "";
        this.dirName = "";
    }

    // Private functions

    function loadAppInfo(next) {
        log.verbose("loadAppInfo");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var filename = path.join(this.appDir, "appinfo.json");
        fs.readFile(filename, function(err, data) {
            try {
                log.verbose("APPINFO >>" + data + "<<");
                this.appinfo = JSON.parse(data);
                // Substitute device folder aliases in onDeviceSource
                if (this.appinfo.onDeviceSource) {
                    for (var from in this.appinfo.onDeviceSource) {
                        var to = this.appinfo.onDeviceSource[from];
                        for (var i in onDeviceSourceAliases) {
                            to = to.replace(i, onDeviceSourceAliases[i]);
                        }
                        this.appinfo.onDeviceSource[from] = to;
                    }
                }
                setImmediate(next);
            } catch(err) {
                setImmediate(next, err);
            }
        }.bind(this));
    }

    function checkAppInfo(next) {
        log.verbose("checkAppInfo");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        log.verbose("checkAppInfo: id: " + this.appinfo.id);
        var schemaFile = path.join(__dirname, "ApplicationDescription.schema");
        async.waterfall([
            fs.readFile.bind(this, schemaFile, "utf-8"),
            function getSchema(data, next) {
                try {
                    var schema = JSON.parse(data);
                    /* "required" keyword is redefined in draft 4.
                        But current jsonschema lib support only draft 3.
                        So this line changes "required" attribute according to the draft 3.
                    */
                    var reqKeys = schema.required;
                    if (reqKeys) {
                        for (key in schema.properties) {
                            if (reqKeys.indexOf(key) != -1) {
                                schema.properties[key].required = true;
                            }
                        }
                    }
                    next(null, schema);
                } catch(err) {
                    next(new Error("Invalid JSON Schema for appinfo"));
                }
             },
            function checkValid(schema, next) {
                try {
                    next(null, new Validator().validate(this.appinfo, schema));
                } catch (err) {
                    log.error(err);
                    next(new Error("Invalid JSON Schema"));
                }
            }.bind(this)
        ], function(err, result){
            if (err) {
                setImmediate(next, err);
            } else {
                if (result && result.errors.length > 0) {
                    var errMsg = "";
                    errMsg = errMsg.concat("Invalid appinfo.json");
                    for (idx in result.errors) {
                        errMsg = errMsg.concat("\n");
                        var errMsgLine = result.errors[idx].property + " "
                                + result.errors[idx].message;
                        if (errMsgLine.indexOf("instance.") > -1) {
                            errMsgLine = errMsgLine.substring("instance.".length);
                        }
                        errMsg = errMsg.concat(errMsgLine);
                    }
                    return setImmediate(next, new Error(errMsg));
                } else {
                    log.verbose("APPINFO is valid");
                }
                setImmediate(next);
            }
        });
    }

    function fillAssetsField(next) {
        log.verbose("fillAssetsField");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        // make appinfo.assets to have default  values so that they can be copied into the package
        this.appinfo.assets = this.appinfo.assets || [];
        for (var i in this.appinfo) {
            if (this.appinfo.hasOwnProperty(i) && defaultAssetsFields[i]) {
                // no duplicated adding & value should not null string & file/dir should exist
                if ((this.appinfo.assets.indexOf(this.appinfo[i]) === -1) && this.appinfo[i]) {
                    this.appinfo.assets.push(this.appinfo[i]);
                }
            }
        }

        //refer to appinfo.json files in localization directory.
        var appInfoPath = this.originAppDir;
        var checkDir = path.join(this.originAppDir, "resources");
        var foundFilePath = [];
        var resourcesAssets = [];
        try {
            var stat = fs.lstatSync(checkDir);
            if (!stat.isDirectory()) {
                return setImmediate(next, null);
            }
        } catch(err) {
            if (err.code === "ENOENT") {
                return setImmediate(next, null);
            }
        }

        async.series([
             walkFolder.bind(null, checkDir, "appinfo.json", foundFilePath),
             function(next) {
                async.forEach(foundFilePath, function(filePath, next) {
                    fs.readFile(filePath, function(err, data) {
                        try {
                            var appInfo = JSON.parse(data);
                            var dirPath = path.dirname(filePath);
                            for (var i in appInfo) {
                                if (appInfo.hasOwnProperty(i) && defaultAssetsFields[i]) {
                                    if (appInfo[i]) {
                                        var itemPath = path.join(dirPath, appInfo[i]);
                                        var relPath = path.relative(appInfoPath, itemPath);
                                        // no duplicated adding & value should not null string & file/dir should exist
                                        if ((resourcesAssets.indexOf(relPath) === -1)) {
                                            resourcesAssets.push(relPath);
                                        }
                                    }
                                }
                            }
                            setImmediate(next, null);
                        } catch(err) {
                            setImmediate(next, new Error("JSON parsing error for " + filePath));
                        }
                    });
                }, function(err) {
                    setImmediate(next, err);
                });
            },
            function(next) {
                this.appinfo.assets = this.appinfo.assets.concat(resourcesAssets);
                setImmediate(next, null);
            }.bind(this)
        ], function(err) {
            setImmediate(next, err);
        });
    }

    function createTmpDir(next) {
        log.verbose("createTmpDir");
        this.tempDir = temp.path({prefix: 'com.palm.ares.hermes.bdOpenwebOS'}) + '.d';
        log.verbose("temp dir = " + this.tempDir);
        mkdirp(this.tempDir, next);
    }

    function createAppDir(next) {
        log.verbose("createAppDir");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        this.applicationDir = path.join(this.tempDir, "data/usr/palm/applications", this.appinfo.id);
        log.verbose("application dir = " + this.applicationDir);
        mkdirp(this.applicationDir, next);
    }

    function minifyApp(next) {
        log.verbose("minifyApp");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var deployJs;
        if (this.minify === true) {
            var isEnyoApp = false;
            if (this.deployscript) {
                deployJs = this.deployscript;
            }
            // Check that app is based on enyo or not
            if (fs.existsSync(path.join(this.appDir, "package.js"))) {
                if (this.appinfo.main && this.appinfo.main.match(/(\.html|\.htm)$/gi))
                {
                    regex = new RegExp("(<script[^>]*src[ \t]*=[ \t]*['\"])[^'\"]*/enyo.js(['\"])");
                    var mainFile = path.join(this.appDir, this.appinfo.main);
                    if (!fs.existsSync(mainFile)) {
                        return setImmediate(next, new Error(this.appinfo.main + " does not exist. please check the file path"));
                    }
                    var data = fs.readFileSync(mainFile);
                    if (data.toString().match(regex) ) {
                        // ENYO APP
                        isEnyoApp = true;
                        // use CLI's builtin enyo minifying tool
                        if (!deployJs) deployJs = path.join(__dirname, "../enyo/tools/deploy.js");
                    }
                }
            }
            if (!isEnyoApp && deployJs) {
                console.log("Ignore deploy-script because minifying is only for enyo app");
                return setImmediate(next);
            }
            log.verbose("minifying tool:", deployJs);
            if (fs.existsSync(deployJs)) {
                var stat = fs.lstatSync(deployJs);
                if (!stat.isFile()) {
                    setImmediate(next, "ERROR: '"+ deployJs+"' is not a valid file path");
                    return;
                }
                var deployArgs = [path.resolve(deployJs)];
                var relSrcRootPath;
                var relEnyoPath;
                var relLibPath;
                //FIXME: WORK-AROUND for splitted structure like the following.
                //  FOO_BOOTPLATE/
                //          appinfo.json
                //        +-----  enyo/
                //        +-----  lib/
                //        +-----  app/
                //                  icon.png
                //                  index.html
                //                  assets/
                //  If there is no deploy.json in the root directory, minifying step try to copy index.html, icon.pn from root directory
                //  But some dev version bootplate structure is like this. so it fails while minifying
                //  Here is a work-around to support this case.
                if (!this['deploy-srcroot']) {
                    if (!fs.existsSync(path.join(this.appDir, 'deploy.json')) && !fs.existsSync(path.join(this.appDir, 'index.html'))) {
                        var srcRootPath = path.dirname(path.resolve(path.join(this.appDir, this.appinfo.main)));
                        if (srcRootPath !== path.basename(path.resolve(this.appDir))) {
                            console.log("Set source code root directory :", srcRootPath);
                            this['deploy-srcroot'] = srcRootPath;
                        }
                    }
                }

                //FIXME: Due to current deploy.js(minify.js) implementation handling '-from', '-to'
                //  If enyo field is specified in deploy.json, and if no '-lib' option used for deploy.js
                //  In minify.js, it assume that lib path is path.join(enyoPath, '../lib')
                //  If lib is used with leading '../lib', than
                //  mapfrom options also should be started with the leading '../lib'
                var deployJson;
                var deployManifest = {};
                if (this['deploy-srcroot']) {
                    deployJson = path.join(this['deploy-srcroot'], 'deploy.json');
                } else {
                    deployJson = path.join(this.appDir, 'deploy.json');
                }
                if (fs.existsSync(deployJson)) {
                    var deployData = fs.readFileSync(deployJson);
                    try {
                        deployManifest = JSON.parse(deployData);
                        if (deployManifest.enyo && !this['deploy-lib']) {
                            this['deploy-lib'] = path.join(this.appDir, path.join(deployManifest.enyo, '../lib'));
                        }
                    } catch (err) {
                        setImmediate(next, "ERROR: invalid deploy.json (" + path.resolve(deployJson) + ")");
                        return;
                    }
                }

                if (this['deploy-srcroot']) {
                    relSrcRootPath = path.relative(path.resolve(this.appDir), path.resolve(this['deploy-srcroot']));
                    deployArgs.push("-s", relSrcRootPath);
                    deployArgs.push("-o", path.join("deploy", path.basename(this.appDir), relSrcRootPath));
                }
                if (this['deploy-enyo']) {
                    relEnyoPath = path.relative(path.resolve(this.appDir), path.resolve(this['deploy-enyo']));
                    deployArgs.push("-e", relEnyoPath);
                }
                if (this['deploy-lib']) {
                    relLibPath = path.relative(path.resolve(this.appDir), path.resolve(this['deploy-lib']));
                    deployArgs.push("-l", relLibPath);
                }

                //FIXME:  Some app contains already  minified enyo library.
                var preMinifiedEnyo = false;
                var enyoPath = (relEnyoPath)? relEnyoPath :
                                    (deployManifest.enyo)?
                                        (this['deploy-srcroot'])? path.join(relSrcRootPath, deployManifest.enyo) : deployManifest.enyo
                                        : 'enyo';
                enyoPath = path.resolve(this.appDir, enyoPath);
                if (!this.appinfo.onDeviceSource || Object.keys(this.appinfo.onDeviceSource).indexOf('enyo') === -1) {
                    if (fs.existsSync(enyoPath) && !fs.existsSync(path.join(enyoPath, 'minify', 'package.js'))) {
                        log.verbose("Enyo is already minified...");
                        preMinifiedEnyo = true;
                        deployArgs.push("-f", "enyo", "-t", "enyo");
                    }
                }

                // Add source mapping arguments
                if (this.appinfo.onDeviceSource) {
                    for (var from in this.appinfo.onDeviceSource) {
                        var to = this.appinfo.onDeviceSource[from];
                        //make sure -f use platform specific path separator
                        from = from.replace(/[/|\\]/g, path.sep);
                        //make sure -t use linux path separator
                        to = to.replace(/[\\]/g, "/");

                        //if lib is specified, 'from' option should be started with lib path
                        if (from.indexOf('lib'+path.sep) !== -1 && this['deploy-lib']) {
                            subFrom = from.substring(from.indexOf('lib'+path.sep)+4);
                            from = path.relative(this.appDir, path.join(path.resolve(this['deploy-lib']),subFrom));
                            from = from.replace(/[/|\\]/g, path.sep);
                        }
                        deployArgs.push("-f", from, "-t", to);
                    }
                }

                console.log("Minifying command...\n", "node " + deployArgs.join(" ") + "\n");
                var subProcess = spawn('node', deployArgs, {cwd: this.appDir});

                var echoStream = function(data) {
                    console.log(data.toString());
                };

                subProcess.stderr.on('data', echoStream);
                subProcess.stdout.on('data', echoStream);

                subProcess.on('exit', function(code) {
                    if (code !== 0) {
                        setImmediate(next, "ERROR: minification failed");
                        return;
                    }
                    var desti = path.join(this.appDir, 'deploy', path.basename(this.appDir));
                    // Exclude packager-only fields frop appinfo.json written to output directory
                    var appinfo = {};
                    for (var i in this.appinfo) {
                        if (this.appinfo.hasOwnProperty(i) && !packagerOnlyFields[i]) {
                            appinfo[i] = this.appinfo[i];
                        }
                    }
                    fs.writeFileSync(path.join(desti, 'appinfo.json'), JSON.stringify(appinfo, null, "\t"));
                    if (fs.existsSync(path.join(this.appDir, 'framework_config.json'))) {
                        shelljs.cp(path.join(this.appDir, 'framework_config.json'), desti);
                    }
                    //FIXME:  Some app contains already  minified enyo library.
                    if (preMinifiedEnyo && fs.existsSync(enyoPath)) {
                        shelljs.cp('-rf', path.join(enyoPath, "*"), path.join(desti,'build'));
                    }

                    console.log("Packaging minified output: " + desti);
                    this.appDir = desti;
                    setImmediate(next);
                }.bind(this));
                return;
            } else if (this.deployscript) {
                setImmediate(next, "Deploy script '" + this.deployscript + "' not found.")
            }
        }
        setImmediate(next);
    }

    function copySrcToDst(src, dst, next) {
        if (['/','\\','*', path.sep].indexOf(src.charAt(src.length-1)) !== -1) {
            src = src.substring(0, src.length-1).concat(path.sep);
        } else {
            src = src.concat(path.sep);
        }
        try {
            if (process.platform === 'win32') {
                try {
                    var stats = fs.statSync(src);
                    if (stats.isDirectory()) {
                        var srcs = [];
                        fs.readdirSync(src).forEach(function(file){
                            srcs.push(path.join(src, file));
                        });
                        shelljs.cp('-rf', srcs, dst);
                    } else {
                        shelljs.cp('-rf', src, dst);
                    }
                    setImmediate(next);
                } catch(err) {
                    setImmediate(next, err);
                }
            } else {
                var rsync = new Rsync();
                rsync.flags({
                        'a': true,
                        'r': true,
                        'v': false
                    });
                //TODO: rsync npm module can't handle the path including blank.
                //      So, the path should be surrounded with double quotes.
                rsync.source('"'+src+'"')
                    .destination('"'+dst+'"');
                rsync.execute(next);
            }
        } catch(err) {
            setImmediate(next, err);
        }
    }

    function copyApp(next) {
        log.verbose("copyApp");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        this.dataCopyCount++;
        copySrcToDst(this.appDir, this.applicationDir, next);
    }

    function copyAssets(next) {
        log.verbose("copyAssets");
        if (this.appCount === 0 || (path.resolve(this.originAppDir) === path.resolve(this.appDir))) {
            return setImmediate(next);
        }
        try {
            async.forEachSeries(this.appinfo.assets, _copyAssets.bind(this), next);
        } catch (err) {
            return setImmediate(next, err);
        }

        function _copyAssets(file, next) {
            var source;
            var destination;
            var isAbsPath = false;

            if (path.resolve(file) == path.normalize(file)) {
                isAbsPath = true;
                source = file;
                return next(new Error("In appinfo.json, '" + file + "'' path must be relative to the appinfo.json."));
            } else {
                source = path.join(this.originAppDir, file);
            }

            if (path.resolve(source).indexOf(this.originAppDir) != 0) {
                return next(new Error("In appinfo.json, '" + file + "'' path must be located under app diectory."));
            }

            if (!fs.existsSync(source)) {
                return next(new Error("'" + file + "'' does not exist. please check the file path."));
            }

            if (path.resolve(source).indexOf(this.originAppDir) === 0) {
                if (isAbsPath === true) {
                    var subPath = path.relative(this.originAppDir, file);
                    destination = path.dirname(path.join(this.appDir, subPath));
                } else {
                    destination = path.dirname(path.join(this.appDir, file));
                }
            } else {
                log.verbose("copyAssets # '" + file + "' will be located in app directory");
                destination = this.appDir;
            }

            async.series([
                function(next) {
                    if (!fs.existsSync(destination)) {
                        mkdirp(destination, next);
                    } else {
                        setImmediate(next);
                    }
                }
            ], function(err) {
                shelljs.cp('-rf', source, destination);
                setImmediate(next, err);
            });
        }
    }
    function excludeIpkFileFromApp(next) {
        log.verbose("excludeIpkFileFromApp");
        //Exclude a pre-built .ipk file
        this.excludeFiles = this.excludeFiles.concat([
            "*[\.]ipk"
        ]);
        setImmediate(next);
    }

    function _retrieve(list, regExp, dirPath, next) {
        async.waterfall([
            fs.readdir.bind(null, dirPath),
            function(fileNames, next) {
                async.forEach(fileNames, function(fileName, next) {
                    var filePath = path.join(dirPath, fileName);
                    async.waterfall([
                        fs.stat.bind(null, filePath),
                        function(stat, next) {
                            var result = false;
                            if (regExp.test(filePath)) {
                                result = true;
                                list.push(filePath);
                            }
                            if (!result && stat.isDirectory()) {
                                _retrieve(list, regExp, filePath, next);
                            } else {
                                setImmediate(next);
                            }
                        }
                    ], next);
                }, next);
            }
        ], function(err) {
            setImmediate(next, err);
        });
    }

    function excludeFromApp(next) {
        log.verbose("excludeFromApp");
        var excludeList = [];
        var excludes;
        if (this.appCount === 0) {
            excludes = this.excludeFiles;
        } else {
            excludes = this.excludeFiles.concat(this.appinfo.exclude || []);
        }
        var regExpQueries = excludes.map(function(exclude) {
            return exclude.replace(/\*/g, "").replace(/$/g,"$");
        }, this);
        var strRegExp = regExpQueries.join("|");
        var regExp = new RegExp(strRegExp, "i");
        async.series([
            _retrieve.bind(this, excludeList, regExp, this.tempDir),
            function(next) {
                try {
                    excludeList.forEach(function(file) {
                            shelljs.rm('-rf', file);
                    });
                    setImmediate(next);
                } catch(err) {
                    setImmediate(next, err);
                }
            }
        ], function(err, results) {
            if (err) {
                return setImmediate(next, err);
            }
            setImmediate(next);
        });
    }

    function rewriteAppInfo(next) {
        log.verbose("rewriteAppInfo");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        if (this.minify !== true) {
            // --no-minify option should discard containerXXX field from appinfo.json
            var appinfo = {};
            for (var i in this.appinfo) {
                if (this.appinfo.hasOwnProperty(i) && !packagerOnlyFields[i] && !containerField[i]) {
                    appinfo[i] = this.appinfo[i];
                }
            }
            fs.writeFileSync(path.join(this.applicationDir, 'appinfo.json'), JSON.stringify(appinfo, null, "\t"));
        }
        setImmediate(next);
    }

    function rewriteAppJS(next) {
        log.verbose("rewriteAppJS");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        if (this.minify === true && this.appinfo.onDeviceSource) {
            //Prevent an abnormal case that app.js has back slash as a path separator
            try {
                var buildDir = path.join(this.applicationDir, 'build');
                if (fs.existsSync(buildDir)) {
                    fs.readdirSync(buildDir).forEach(function(fileName) {
                        var file = path.join(buildDir, fileName);
                        var stats = fs.statSync(file);
                        if (stats.isFile()) {
                            var data = fs.readFileSync(file, "utf8");
                            var regex = /enyo.path.addPath\(.*\)|enyo.depends\(.*[\s\S]*\)/g;
                            while ( (result = regex.exec(data)) != null ) {
                                data = data.replace(result[0], result[0].replace(/[\\]/g, "/"));
                            }
                            fs.writeFileSync(file, data, "utf8");
                        }
                    });
                }
            } catch (err) {
                setImmediate(next, err);
            }
        }
        setImmediate(next);
    }

    function rewriteSourcePaths(next) {
        log.verbose("rewriteSourcePaths");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        if (this.minify === true) {
            if (this.appinfo.onDeviceSource) {
                var htmls = (this.appinfo.additionalHtmlFiles || []).concat(this.appinfo.main);
                for (var i in htmls) {
                    var html = htmls[i];
                    try {
                        var file = path.join(this.applicationDir, html);
                        var data = fs.readFileSync(file, "utf8");
                        for (var from in this.appinfo.onDeviceSource) {
                            var to = this.appinfo.onDeviceSource[from];
                            // Any <script> or <link> tags starting in a path matching an onDeviceSource mapping get rewritten
                            var regex = new RegExp("(<link[^>]*href[ \t]*=[ \t]*['\"][ \t]*)" + from);
                            data = data.replace(regex, "$1" + to);
                            regex = new RegExp("(<script[^>]*src[ \t]*=[ \t]*['\"][ \t]*)" + from);
                            data = data.replace(regex, "$1" + to);
                            // Special-case handling for redirecting bootplate enyo build
                            if (from == "enyo") {
                                regex = new RegExp("(<link[^>]*href[ \t]*=[ \t]*['\"])[^'\"]*build/enyo.css(['\"])");
                                data = data.replace(regex, "$1" + to + "/enyo.css" + "$2");
                                regex = new RegExp("(<script[^>]*src[ \t]*=[ \t]*['\"])[^'\"]*build/enyo.js(['\"])");
                                data = data.replace(regex, "$1" + to + "/enyo.js" + "$2");
                            }
                        }
                        fs.writeFileSync(file, data, "utf8");
                    } catch(err) {
                        setImmediate(next, err);
                    }
                }
            }
        } else {
            var htmls = (this.appinfo.additionalHtmlFiles || []).concat(this.appinfo.main);
            for (var i in htmls) {
                var html = htmls[i];
                try {
                    var file = path.join(this.applicationDir, html);
                    var data = fs.readFileSync(file, "utf8");
                    // Special-case handling not to refer to minified enyo
                    var regex = new RegExp("(<link[^>]*href[ \t]*=[ \t]*['\"])[^'\"]*build/enyo.css(['\"]).*(/>|</link>)");
                    data = data.replace(regex, "");
                    regex = new RegExp("(<script[^>]*src[ \t]*=[ \t]*['\"])[^'\"]*build/enyo.js(['\"]).*(/>|</script>)");
                    data = data.replace(regex, "");
                    fs.writeFileSync(file, data, "utf8");
                } catch(err) {
                    setImmediate(next, err);
                }
            } 
        }
        setImmediate(next);
    }

    function createPackageDir(next) {
        log.verbose("createPackageDir");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        if (!this.rom) {
            this.packageDir = path.join(this.tempDir, "data/usr/palm/packages", this.appinfo.id);
            log.verbose("package dir = " + this.packageDir);
            mkdirp(this.packageDir, next);
        } else {
            setImmediate(next);
        }
    }

    function fillPackageDir(next) {
        log.verbose("fillPackageDir");
        if (this.appCount === 0) {
            return setImmediate(next);
        }

        if (!this.rom) {
            if (!this.pkgDir) {
            	// Generate packageinfo.json
                var pkginfo = {
                    "app": this.appinfo.id,
                    "id": this.appinfo.id,
                    "loc_name": this.appinfo.title,
                    "package_format_version": this.appinfo.uiRevision,      // TODO: Ok ?
                    "vendor": this.appinfo.vendor,
                    "version": this.appinfo.version || "1.0.0"
                };
                var data = JSON.stringify(pkginfo, null, 2) + "\n";
                log.verbose("Generating package.json: " + data);
                fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
            } else {
                // copy packageinfo.json from package Directory
                shelljs.cp('-Rf', path.join(this.pkgDir, "packageinfo.json"), this.packageDir);
                setImmediate(next);
            }
        } else {
            setImmediate(next);
        }
    }

    function loadPackageProperties (next) {
        log.verbose("loadPackageProperties");
        this.packageProperties = {};
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var filename = path.join(this.originAppDir, "package.properties");
        if (fs.existsSync(filename)) {
            fs.readFile(filename, function(err, data) {
                try {
                    log.verbose("PACKAGE PROPERTIES >>" + data + "<<");            
                    var lines = data.toString().split("\n"),
                        seperatorIndex,
                        i;
                    for(i in lines) {
                        if(lines[i].indexOf("filemode.") == 0) {
                            seperatorIndex = lines[i].indexOf("=");
                            var fileList = lines[i].substr(seperatorIndex + 1).trim();
                            var fileMode = lines[i].slice(9, seperatorIndex).trim();
                            var fileArray = fileList.split(",");
                            fileArray.forEach(function(file) {
                                file = file.replace(/\\/g,"/").trim();
                                var idx = file.lastIndexOf("/");
                                file = (idx !== -1)? file.substr(idx+1):file;
                                this.packageProperties[file] = fileMode;
                            }.bind(this));
                        }
                    }
                    // Exclude package.propeties from ipk file
                    this.excludeFiles = this.excludeFiles.concat([
                        "package.properties"
                    ]);
                    setImmediate(next);
                } catch (err) {
                    setImmediate(next, err);
                }
            }.bind(this));
        } else {
            setImmediate(next);
        }
    }

    function outputPackage(destination, pkgName, pkgVersion, next) {
        if (this.rom) {
            shelljs.cp('-Rf', path.join(this.tempDir, "data/*"), destination);
            setImmediate(next);
        } else {
            async.series([
                decidePkgName.bind(this, pkgName, pkgVersion),
                makeTgz.bind(this,'data','data.tar.gz'),
                createCtrlDir.bind(this),
                createControlFile.bind(this),
                makeTgz.bind(this,'ctrl','control.tar.gz'),
                createDebianBinary.bind(this),
                removeExistingIpk.bind(this, destination),
                makeIpk.bind(this, destination)
            ], function(err, results) {
                if (err) {
                    setImmediate(next, err);
                    return;
                }
                setImmediate(next);
            });
        }
    }

    function decidePkgName(pkgName, pkgVersion, next) {
        if (this.appCount !== 0) {
            this.pkg = {
                name : pkgName || this.appinfo.id,
                version : pkgVersion || this.appinfo.version
            };
        } else if (this.services.length > 0) {
            this.pkg = {
                name : pkgName || this.services[0].serviceInfo.id || this.services[0].serviceInfo.services[0].name,
                version : pkgVersion || "1.0.0"
            };
        } else {
            this.pkg = {
                name : pkgName || "unknown",
                version : pkgVersion || "1.0.0"
            };
        }
        setImmediate(next);
    }

    function createCtrlDir(next) {
        log.verbose("createCtrlDir");
        this.ctrlDir = path.join(this.tempDir, "ctrl");
        log.verbose("ctrl dir = " + this.ctrlDir);
        mkdirp(this.ctrlDir, next);
    }

    function createControlFile(next) {
        log.verbose("createControlFile");

        var lines = [
			"Package: " + this.pkg.name,
			"Version: " + this.pkg.version,
			"Section: misc",
			"Priority: optional",
			"Architecture: all",
			"Installed-Size: " + 1234,                       // TODO: TBC
			"Maintainer: N/A <nobody@example.com>",          // TODO: TBC
			"Description: This is a webOS application.",
			"webOS-Package-Format-Version: 2",               // TODO: TBC
			"webOS-Packager-Version: x.y.x",                 // TODO: TBC
			''  // for the trailing \n
		];

        fs.writeFile(path.join(this.ctrlDir, 'control'), lines.join("\n"), next);
    }

    function createDebianBinary(next) {
        log.verbose("createDebianBinary");
        fs.writeFile(path.join(this.tempDir, "debian-binary"), "2.0\n", next);
    }

    function makeTgz(subdir,output,next) {
		var inPath = path.join(this.tempDir, subdir) ;
        log.verbose("makeTgz " + output + " from " + inPath);

		var chopAt = String(inPath).length ;
		var filter = function(p) {
			return '.' + p.slice(chopAt) ;
		};

        var pkgServiceNames = this.pkgServiceNames;
        //@see https://github.com/isaacs/node-tar/issues/7
        // it is a workaround for packaged ipk on windows can set +x into directory
        var fixupDirs = function(entry) {
            // Make sure readable directories have execute permission
            if (entry.props.type === "Directory") {
                maskingBits = 0311;
                // special case for service directory should have writable permission.
                if (pkgServiceNames.indexOf(entry.props.basename) !== -1) {
                    maskingBits = 0333;
                }
                entry.props.mode |= (entry.props.mode >>> 2) & maskingBits;
            }
            return true;
        }

		fstream
			.Reader( {path: inPath, type: 'Directory', filter: fixupDirs } )
			.pipe(tarFilterPack({ noProprietary: true, pathFilter: filter, permission : this.packageProperties }))
			.pipe(zlib.createGzip())
			.pipe(fstream.Writer(path.join(this.tempDir,output)))
			.on("close", next)
		    .on('error', next);

    }

    function removeExistingIpk(destination, next) {
        log.verbose("removeExistingIpk");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var filename = path.join(destination, this.appinfo.id + "_" + this.appinfo.version + "_all.ipk");

        fs.exists(filename, function (exists) {
            if (exists) {
                fs.unlink(filename, next);
            } else {
                setImmediate(next);         // Nothing to do
            }
        });
    }

	function padSpace(input,length) {
		// max field length in ar is 16
		var ret = String(input + '                                     ' ) ;
		return ret.slice(0,length) ;
	}

	function arFileHeader(name, size ) {
		var epoch = Math.floor(Date.now() / 1000) ;
		return padSpace(name, 16)
			+ padSpace(epoch, 12)
			+ "0     " // UID, 6 bytes
			+ "0     " // GID, 6 bytes
			+ "100644  " // file mode, 8 bytes
			+ padSpace(size, 10)
			+ "\x60\x0A"   // don't ask
			;

	}

    function makeIpk(destination, next) {
        var filename = this.pkg.name;
        if (this.pkg.version) {
            filename = filename.concat("_" + this.pkg.version + "_all.ipk");
        } else {
            filename = filename.concat(".ipk");
        }
        this.ipk = path.join(destination, filename);
        log.verbose("makeIpk in dir " + destination + " file " + filename );

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            shelljs.exec("ar -q " + this.ipk + " debian-binary control.tar.gz data.tar.gz", {silent: this.silent});

            console.log("Creating package " + filename + " in " + destination);

            setImmediate(next);
            return;
        }

		var arStream = CombinedStream.create();

		// global header, see http://en.wikipedia.org/wiki/Ar_%28Unix%29
		var header = "!<arch>\n" ;
		var debBinary = arFileHeader("debian-binary",4) + "2.0\n" ;
		var that = this ;

		arStream.append(header + debBinary);

		var pkgFiles = [ 'control.tar.gz', 'data.tar.gz' ] ;
		var ipkStream  = fstream.Writer(this.ipk) ;

		pkgFiles.forEach( function (f) {
			var fpath = path.join(that.tempDir,f) ;
			var s = fstream.Reader({ path: fpath, type: 'File'}) ;
			var stat = fs.statSync(fpath) ; // TODO: move to asynchronous processing

			arStream.append(arFileHeader(f, stat.size));
			arStream.append(s);
            if ((stat.size % 2) !== 0) {
                log.verbose('Adding a filler for file ' + f);
                arStream.append('\n');
            }
		}, this);

		arStream.pipe(ipkStream) ;

		ipkStream.on('close', function() {
			console.log("Creating package " + filename + " in " + destination);
			setImmediate(next);
		});
		ipkStream.on('error', next);
    }

    function cleanupTmpDir(next) {
        log.verbose("cleanupTmpDir");
        if (this.noclean) {
            console.log("Skipping removal of  " + this.tempDir);
            setImmediate(next);
        } else {
            rimraf(this.tempDir, function(err) {
                log.verbose("cleanup(): removed " + this.tempDir);
                setImmediate(next, err);
            }.bind(this));
        }
    }

    function checkDirectory(options, directory, callback) {
        log.verbose("checkDirectory: " + directory);

        if (fs.existsSync(directory)) {                                 // TODO: move to asynchronous processing
            var stat = fs.statSync(directory);
            if ( ! stat.isDirectory()) {
                callback("ERROR: '" + directory + "' is not a directory");
                return;
            }
            directory = fs.realpathSync(directory);
        } else {
            callback("ERROR: directory '" + directory + "' does not exist");
            return;
        }
        if (options.force) {
            return callback();
        }

        if (fs.existsSync(path.join(directory, "appinfo.json"))) {      // TODO: move to asynchronous processing
            this.appCount++;
            log.verbose("FOUND appinfo.json, appCount " + this.appCount);
            if (this.appCount > 1) {
                callback("ERROR: only one application is supported");
            } else {
                this.appDir = directory;
                this.originAppDir = directory;
                callback();
            }
        } else if (fs.existsSync(path.join(directory, "packageinfo.json"))) {
            this.pkgDir = directory;
            callback();
        } else if (fs.existsSync(path.join(directory, "services.json"))) {
            this.svcDir = this.svcDir || [];
			this.svcDir = this.svcDir.concat(directory);
            callback();
        } else if (fs.existsSync(path.join(directory, "account-templates.json"))) {
            callback("ERROR: account directory support is not yet implemented");
        } else {
            //find service directory recursively
            var foundSvcDirs = [];
            this.svcDir = this.svcDir || [];
			this.svcDir = this.svcDir.concat(directory);
            findServiceDir.call(this, foundSvcDirs, function(err) {
                if (foundSvcDirs.length > 0) {
                    callback();
                } else {
                    callback("ERROR: '" + directory + "' has no webOS json files");
                }
            });
        }
    }

    //* find service directories checking if directory has services.json file
    function findServiceDir(services, next) {
        var checkDirs = [].concat(this.svcDir || this.originAppDir || []);
        var foundFilePath = [];
        if (checkDirs.length === 0) {
            return setImmediate(next);
        }
        async.forEach(checkDirs, function(checkDir, next) {
            walkFolder(checkDir, "services.json", foundFilePath, function(err) {
                if (err) {
                    return setImmediate(next, err);
                }
                foundFilePath.forEach(function(filePath) {
                    var svc = new Service();
                    svc.srcDir = path.dirname(filePath);
                    svc.dirName = path.basename(svc.srcDir);
                    services.push(svc);
                });
                setImmediate(next, err);
            });
        }, function(err) {
            setImmediate(next, err);
        });
    }

    function walkFolder(dirPath, findFileName, foundFilePath, next) {
        async.waterfall([
            fs.readdir.bind(null, dirPath),
            function(fileNames, next) {
                async.forEach(fileNames, function(fileName, next) {
                    var filePath = path.join(dirPath, fileName);
                    async.waterfall([
                        fs.lstat.bind(null, filePath),
                        function(stat, next) {
                            if (stat.isFile()) {
                                if (fileName === findFileName) {
                                    foundFilePath.push(filePath);
                                }
                                next();
                            } else if (stat.isDirectory()) {
                                walkFolder(filePath, findFileName, foundFilePath, next);
                            } else {
                                next();
                            }
                        }
                    ], next); //async.waterfall
                }, next); //async.forEach
            }
        ], function(err) {
            next(err);
        }); //async.waterfall
    }

    //* read services.json recursivly
    function loadServiceInfo(next) {
        log.verbose("loadServiceInfo");
        for (idx in this.services) {
            var filename = path.join(this.services[idx].srcDir, "services.json");
            try {
                var data = fs.readFileSync(filename);
                this.services[idx].serviceInfo = JSON.parse(data);
                this.services[idx].valid = true;
            } catch (err) {
                return setImmediate(next, err);
            }
        }
        log.verbose("num of serviceInfo: " + this.services.length);
        setImmediate(next);
    }

    //* check services.json recursivly
    function checkServiceInfo(next) {
        log.verbose("checkServiceInfo");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var appId = this.appinfo.id;
        this.services.forEach(function(service) {
            if (service.valid === false)
                return;
            getPkgServiceNames(service.serviceInfo).forEach(function(serviceName) {
                //serviceName should start with appinfo.id
                if (serviceName.indexOf(appId + ".") === -1) {
                    var errMsg = "service name \"" + serviceName + "\"" +
                        " must be subdomain of app id \"" + appId + "\"";
                    return setImmediate(next, new Error(errMsg));
                }
            }.bind(this));
        }.bind(this));
        setImmediate(next);
    }

    //* create dir with each service's name under (tmp) + data/usr/palm/services/
    function createServiceDir(next) {
        log.verbose("createServiceDir");
        this.services.forEach(function(service) {
            if (service.valid === false)
                return;
            getPkgServiceNames(service.serviceInfo).forEach(function(serviceName) {
                var serviceDir = path.join(this.tempDir, "data/usr/palm/services", serviceName);
                service.dstDirs.push(serviceDir);
                try {
                    mkdirp.sync(serviceDir);
                } catch (err) {
                    return setImmediate(next, err);
                }
            }.bind(this));
        }.bind(this));
        setImmediate(next);
    }

    //* copy service files into each serviceInfos[x].id directory.
    function copyService(next) {
        log.verbose("copyService");
        var validServices = this.services.filter(function(service) {
            return service.valid;
        });
        try {
            async.forEachSeries(validServices, function(service, next) {
                async.forEach(service.dstDirs, function(dstDir, next) {
                    this.dataCopyCount++;
                    copySrcToDst(service.srcDir, dstDir, next);
                }, next);
            }, next);
        } catch (err) {
            setImmediate(next, err);
        }
    }

    //* add service info into packageinfo.json.
    function addServiceInPkgInfo(next) {
        log.verbose("addServiceInPkgInfo");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        if (!this.rom) {
            var filename = path.join(this.packageDir, "packageinfo.json");
            var pkginfo;
            try {
                var data = fs.readFileSync(filename);
                var validServiceCount = 0;
                log.verbose("PACKAGEINFO >>" + data + "<<");
                pkginfo = JSON.parse(data);
            } catch (err) {
                console.error(err);
                setImmediate(next, err);
            }
            var validServices = this.services.filter(function(s) {
                return s.valid;
            }).forEach(function(service) {
                getPkgServiceNames(service.serviceInfo).forEach(function(serviceName) {
                    this.pkgServiceNames.push(serviceName);
                    validServiceCount++;
                }.bind(this));
            }.bind(this));
            if (validServiceCount > 0) {
                pkginfo["services"] = this.pkgServiceNames;
                var data = JSON.stringify(pkginfo, null, 2) + "\n";
                log.verbose("Modified package.json: " + data);
                fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
            } else {
                setImmediate(next);
            }
        } else {
            setImmediate(next);
        }
    }

    //* remove service dir from tmp source dir before packaging
    function removeServiceFromAppDir(next) {
        log.verbose("removeServiceFromAppDir");
        if (this.appCount === 0) {
            return setImmediate(next);
        }
        var checkDir = this.applicationDir;
        var needRmCheckDir = false;
        var fileList = fs.readdirSync(checkDir);
        if (fileList.indexOf('services') !== -1) {
            checkDir = path.join(this.applicationDir, 'services');
            var stats = fs.statSync(checkDir);
            if (stats.isDirectory()) {
                needRmCheckDir = true;
            }
        }
        if (needRmCheckDir === true) {
            try {
                shelljs.rm('-rf', checkDir);
            } catch (err) {
                console.log("ERROR:" + err);
            }
        } else {
            for (var idx in this.services) {
                var dirName = this.services[idx].dirName;
                fileList.forEach(function(dir) {
                    if (dirName === dir) {
                        try {
                            var rmDir = path.join(this.applicationDir, this.services[idx].dirName);
                            shelljs.rm('-rf', rmDir);
                        } catch (err) {
                            console.log("ERROR:" + err);
                        }
                    }
                }, this);
            }
        }
        setImmediate(next);
    }

    function copyData(inDirs, forceCopy, next) {
        log.verbose("copyData ** Only run when force packaging");
        if ( forceCopy && this.dataCopyCount === 0 ) {
            var dst = path.join(this.tempDir, "data");
            async.forEachSeries(inDirs, function(src, next) {
                    copySrcToDst(src, dst, next)
                },
                function(err, results) {
                    setImmediate(next, err);
                }.bind(this));
        } else {
            return setImmediate(next);
        }
    }

    function getPkgServiceNames(serviceInfo) {
        var serviceNames = [];
        if (servicePkgMethod === "id") {
            serviceNames = [serviceInfo.id];
        } else {
            if (serviceInfo.services) {
                var serviceProps = (serviceInfo.services instanceof Array) ?
                    serviceInfo.services : [serviceInfo.services];
                serviceNames = serviceProps.map(function(serviceProp) {
                    return serviceProp.name
                });
            }
        }
        return serviceNames;
    }
}());

