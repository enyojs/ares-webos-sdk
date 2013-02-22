var fs = require("fs"),
    util = require('util'),
    path = require('path'),
    shelljs = require('shelljs'),
    mkdirp = require('mkdirp'),
    temp = require("temp"),
    zlib = require('zlib'),
    tar = require('tar'),
    rimraf = require("rimraf"),
    fstream = require('fstream'),
    spawn = require('child_process').spawn,
    async = require('async');

(function () {

    var packager = {};

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = packager;
    }

    var objectCounter = 0;

    function Packager(options) {
        this.objectId = objectCounter++;
        this.verbose = false;
        this.silent = true;
        if (options && options.verbose === true) {
            this.verbose = true;
            this.silent = false;
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
        this.debug("Xtor Packager id=" + this.objectId);
        this.appCount = 0;
    }

    packager.Packager = Packager;

    Packager.prototype = {

        checkInputDirectories: function(inDirs, options, next) {
            this.debug("checkInputDirectories: " + inDirs);

            async.forEachSeries(inDirs, checkDirectory.bind(this, options),
                function(err, results) {
                    if (err) {
                        next(err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    if (this.appCount === 0) {
                        next("ERROR: At least an APP_DIR must be specified");
                        return;
                    }
                    next();
                }.bind(this));
        },

        generatePackage: function(inDirs, destination, options, next) {
            this.debug("generatePackage: from " + inDirs);

            async.series([
                    this.checkInputDirectories.bind(this, inDirs, options),
                    loadAppInfo.bind(this),
                    checkAppInfo.bind(this),
                    createTmpDir.bind(this),
                    createAppDir.bind(this),
                    minifyApp.bind(this),
                    copyApp.bind(this),
                    createPackageDir.bind(this),
                    fillPackageDir.bind(this),
                    makeTgz.bind(this,'data','data.tar.gz'),
                    createCtrlDir.bind(this),
                    createControlFile.bind(this),
                    makeTgz.bind(this,'ctrl','control.tar.gz'),
                    createDebianBinary.bind(this),
                    removeExistingIpk.bind(this, destination),
                    makeIpk.bind(this, destination),
                    cleanupTmpDir.bind(this)
                ], function(err, results) {
                    if (err) {
                        // TODO: call cleanupTmpDir() before returning
                        next(err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    next();
                }.bind(this));
        },

        debug: function(msg) {
            if (this.verbose) {
                console.log(msg);
            }
        },

        log: function(msg) {
            console.log(msg);
        }
    };

    // Private functions

    function loadAppInfo(next) {
        this.debug("loadAppInfo");
        var filename = path.join(this.appDir, "appinfo.json");
        fs.readFile(filename, function(err, data) {
            try {
                this.debug("APPINFO >>" + data + "<<");
                this.appinfo = JSON.parse(data);
                next();
            } catch(error) {
                next("ERROR: unable to read " + filename);
            }
        }.bind(this));
    }

    function checkAppInfo(next) {
        this.debug("checkAppInfo: id: " + this.appinfo.id);
        next();
    }

    function createTmpDir(next) {
        this.debug("createTmpDir");
        this.tempDir = temp.path({prefix: 'com.palm.ares.hermes.bdOpenwebOS'}) + '.d';
        this.debug("temp dir = " + this.tempDir);
        mkdirp(this.tempDir, next);
    }

    function createAppDir(next) {
        this.debug("createAppDir");
        this.applicationDir = path.join(this.tempDir, "data/usr/palm/applications", this.appinfo.id);
        this.debug("application dir = " + this.applicationDir);
        mkdirp(this.applicationDir, next);
    }

    function minifyApp(next) {
        this.debug("minifyApp");
        var minify = false;
        if (this.minify === true) {
            var deployJs = path.join(this.appDir, "enyo/tools/deploy.js");
            if (fs.existsSync(deployJs)) {
                var subProcess = spawn('node', [deployJs], {cwd: this.appDir});

                var echoStream = function(data) {
                    console.log(data.toString());
                };

                subProcess.stderr.on('data', echoStream);
                subProcess.stdout.on('data', echoStream);

                subProcess.on('exit', function(code) {
                    if (code !== 0) {
                        next("ERROR: minification failed");
                        return;
                    }
                    var desti = path.join(this.appDir, 'deploy', path.basename(this.appDir));
                    shelljs.cp(path.join(this.appDir, 'appinfo.json'), desti);
                    shelljs.cp(path.join(this.appDir, 'framework_config.json'), desti);

                    console.log("packaging minified output: " + desti);
                    this.appDir = desti;
                    next();
                }.bind(this));
                return;
            }
        }

        if (minify === false) {
            next();
        }
    }

    function copyApp(next) {
        this.debug("copyApp");
        var files = shelljs.ls(this.appDir);
        files.forEach(function(file) {
            shelljs.cp('-r', path.join(this.appDir, file), this.applicationDir);
        }, this);
        next();
    }

    function createPackageDir(next) {
        this.debug("createPackageDir");
        this.packageDir = path.join(this.tempDir, "data/usr/palm/packages", this.appinfo.id);
        this.debug("package dir = " + this.packageDir);
        mkdirp(this.packageDir, next);
    }

    function fillPackageDir(next) {
        this.debug("fillPackageDir");

        // Copy icon file
        var filename = path.join(this.appDir, this.appinfo.icon);
        this.debug("Copying: " + filename + " to " + this.packageDir);
        shelljs.cp(filename, this.packageDir);

        // Generate packageinfo.json
        var pkginfo = {
            "app": this.appinfo.id,
            "icon": this.appinfo.icon,
            "id": this.appinfo.id,
            "loc_name": this.appinfo.title,
            "package_format_version": this.appinfo.uiRevision,      // TODO: Ok ?
            "vendor": this.appinfo.vendor,
            "version": "1.0.0"

        };
        this.debug("Generating package.json: " + data);
        var data = JSON.stringify(pkginfo, null, 2) + "\n";
        fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
    }

    function createCtrlDir(next) {
        this.debug("createCtrlDir");
        this.ctrlDir = path.join(this.tempDir, "ctrl");
        this.debug("ctrl dir = " + this.ctrlDir);
        mkdirp(this.ctrlDir, next);
    }

    function createControlFile(next) {
        this.debug("createControlFile");

        var lines = [
			"Package: " + this.appinfo.id,
			"Version: " + this.appinfo.version,
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
        this.debug("createDebianBinary");
        fs.writeFile(path.join(this.tempDir, "debian-binary"), "2.0\n", next);
    }

    function makeTgz(subdir,output,next) {
		var inPath = path.join(this.tempDir, subdir) ;
        this.debug("makeTgz " + output + " from " + inPath);

		var chopAt = String(inPath).length ;
		var filter = function(p) {
			return '.' + p.slice(chopAt) ;
		};

		fstream
			.Reader( {path: inPath, type: 'Directory' }  )
			.pipe(tar.Pack({ noProprietary: true, pathFilter: filter }))
			.pipe(zlib.createGzip())
			.pipe(fstream.Writer( path.join(this.tempDir,output)))
			.on("close",next);
    }

    function removeExistingIpk(destination, next) {
        this.debug("removeExistingIpk");

        var filename = path.join(destination, this.appinfo.id + "_" + this.appinfo.version + "_all.ipk");

        fs.exists(filename, function (exists) {
            if (exists) {
                fs.unlink(filename, next);
            } else {
                next();         // Nothing to do
            }
        });
    }

    function makeIpk(destination, next) {
        this.debug("makeIpk");

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            var filename = this.appinfo.id + "_" + this.appinfo.version + "_all.ipk";
            shelljs.exec("ar -q " + path.join(destination, filename) + " debian-binary control.tar.gz data.tar.gz", {silent: this.silent});

            console.log("creating package " + filename + " in " + destination);

            next();
            return;
        }

        next("NOT YET IMPLEMENTED");
    }

    function cleanupTmpDir(next) {
        this.debug("cleanupTmpDir");
        if (this.noclean) {
            this.debug("Skipping removal of  " + this.tempDir);
            next();
        } else {
            rimraf(this.tempDir, function(err) {
                this.debug("cleanup(): removed " + this.tempDir);
                next(err);
            }.bind(this));
        }
    }

    function checkDirectory(options, directory, callback) {
        this.debug("checkDirectory: " + directory);

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

        if (fs.existsSync(path.join(directory, "appinfo.json"))) {      // TODO: move to asynchronous processing
            this.appCount++;
            this.debug("FOUND appinfo.json, appCount " + this.appCount);
            if (this.appCount > 1) {
                callback("ERROR: only one application is supported");
            } else {
                this.appDir = directory;
                callback();
            }
        } else if (fs.existsSync(path.join(directory, "packageinfo.json"))) {
            callback("ERROR: package directory support is not yet implemented");
        } else if (fs.existsSync(path.join(directory, "services.json"))) {
            callback("ERROR: service directory support is not yet implemented");
        } else if (fs.existsSync(path.join(directory, "account-templates.json"))) {
            callback("ERROR: account directory support is not yet implemented");
        } else {
            callback("ERROR: '" + directory + "' has no Open webOS json files");
        }
    }
}());