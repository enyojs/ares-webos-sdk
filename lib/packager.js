var fs = require("fs"),
    util = require('util'),
    path = require('path'),
    shelljs = require('shelljs'),
    mkdirp = require('mkdirp'),
    temp = require("temp"),
    zlib = require('zlib'),
    archiver = require('archiver'),
    rimraf = require("rimraf"),
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
        if (options && options.verbose === true) {
            this.verbose = true;
        }
        this.noclean = false;
        if (options && options.noclean === true) {
            this.noclean = true;
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
                    next();
                });
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

                    cleanupTmpDir.bind(this)
                ], function(err, results) {
                    if (err) {
                        // TODO: call cleanupTmpDir() before returning
                        next(err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    next();
                });
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
        next();         // TODO: TBC
    }

    function makeDataTar(next) {
        this.debug("makeDataTar");

        var files = shelljs.ls('-R', path.join(this.tempDir, 'usr'));

        var out = fs.createWriteStream(path.join(this.tempDir, 'data.tar.gz'));
        var gzipper = zlib.createGzip();
        var archive = archiver.createTar();

        archive.on('error', function(err) {
            console.log("ARCHIVER err= " + err);
        });

        archive.pipe(gzipper).pipe(out);

        shelljs.cd(this.tempDir);

        async.forEachSeries(files, function(file, cb) {
            file = path.join('./usr', file);
            var stats = fs.statSync(file);
            if (stats.isFile()) {
                this.debug("Adding to tarball: " + file);
                archive.addFile(fs.createReadStream(file), { name: file }, cb);
            } else {
                this.debug("Tarball Skipping : " + file);
                cb();
            }
        }.bind(this), function(err) {
            if (err) {
                console.log("ASYNC END err= " + err);
                next(err);
                return;
            }

            archive.finalize(function(err, written) {
                if (err) {
                    console.log("ARCHIVER FINALYZE err= " + err);
                    next(err);
                    return;
                }

                console.log(written + ' total bytes written');
                next();
            });
        });
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

        if (fs.existsSync(path.join(directory, "appinfo.json"))) {
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