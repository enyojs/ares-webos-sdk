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
            this.debug("generatePackage: " + inDirs);

            async.series([
                    this.checkInputDirectories.bind(this, inDirs, options),
                    loadAppInfo.bind(this),
                    checkAppInfo.bind(this),
                    createTmpDir.bind(this),
                    createAppDir.bind(this),
                    copyApp.bind(this),
                    createPackageDir.bind(this),
                    fillPackageDir.bind(this),
                    makeDataTar.bind(this),
                    createControlFile.bind(this),
                    makeControlTar.bind(this),
                    createDebianBinary.bind(this),
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
        this.applicationDir = path.join(this.tempDir, "usr/palm/applications", this.appinfo.id);
        this.debug("application dir = " + this.applicationDir);
        mkdirp(this.applicationDir, next);
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
        this.packageDir = path.join(this.tempDir, "usr/palm/packages", this.appinfo.id);
        this.debug("package dir = " + this.packageDir);
        mkdirp(this.packageDir, next);
    }

    function fillPackageDir(next) {
        this.debug("fillPackageDir");

        // Copy icon file
        var filename = this.appinfo.icon;
        shelljs.cp(path.join(this.appDir, filename), this.packageDir);

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
        var data = JSON.stringify(pkginfo, null, 2) + "\n";
        fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
    }

    function makeDataTar(next) {
        this.debug("makeDataTar in " + this.tempDir);

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            shelljs.exec("tar cvzf " + path.join(this.tempDir, 'data.tar.gz') + " ./usr", {silent: this.silent});
            next();
            return;
        }

		var chopAt = String(this.tempDir).length ;
		var filter = function(p) {
			return '.' + p.slice(chopAt) ;
		};

		fstream
			.Reader({ path: path.join(this.tempDir,  'usr'), type: "Directory" })
			.pipe(tar.Pack({ noProprietary: true, pathFilter: filter }))
			.pipe(zlib.createGzip())
			.pipe(fstream.Writer( path.join(this.tempDir,"data.tar.gz")));
    }

    function createControlFile(next) {
        this.debug("createControlFile");
        var ctrl = addLine("", "Package: " + this.appinfo.id);
        ctrl = addLine(ctrl, "Version: " + this.appinfo.version);
        ctrl = addLine(ctrl, "Section: misc");
        ctrl = addLine(ctrl, "Priority: optional");
        ctrl = addLine(ctrl, "Architecture: all");
        ctrl = addLine(ctrl, "Installed-Size: " + 1234);                       // TODO: TBC
        ctrl = addLine(ctrl, "Maintainer: N/A <nobody@example.com>");          // TODO: TBC
        ctrl = addLine(ctrl, "Description: This is a webOS application.");
        ctrl = addLine(ctrl, "webOS-Package-Format-Version: 2");               // TODO: TBC
        ctrl = addLine(ctrl, "webOS-Packager-Version: x.y.x");                 // TODO: TBC

        fs.writeFile(path.join(this.tempDir, "control"), ctrl, next);
    }

    function createDebianBinary(next) {
        this.debug("createDebianBinary");
        fs.writeFile(path.join(this.tempDir, "debian-binary"), "2.0\n", next);
    }

    function addLine(buffer, msg) {
        buffer += (msg + "\n");
        return buffer;
    }

    function makeControlTar(next) {
        this.debug("makeControlTar");

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            shelljs.exec("tar cvzf " + path.join(this.tempDir, 'control.tar.gz') + " ./control", {silent: this.silent});
            next();
            return;
        }

        next("NOT YET IMPLEMENTED");
    }

    function makeIpk(destination, next) {
        this.debug("makeIpk");

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            var filename = this.appinfo.id + "_" + this.appinfo.version + "_all.ipk";
            shelljs.exec("ar -q " + path.join(destination, filename) + " control.tar.gz data.tar.gz debian-binary", {silent: this.silent});

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