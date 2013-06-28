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
    async = require('async'),
    CombinedStream = require('combined-stream');

(function () {

    var onDeviceSourceAliases = {
        "$frameworks": "/usr/palm/frameworks",
        "$enyo-framework": "/usr/palm/frameworks/enyo"
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
        if (options && options.hasOwnProperty('deployscript')) {
            this.deployscript = options.deployscript;
        }
        this.excludedir = [];
        if (options && options.hasOwnProperty('excludedir')) {
            if(options.excludedir instanceof Array) {
                this.excludedir = options.excludedir;
            }
            else {
                this.excludedir.push(options.excludedir);
            }
        }
        this.rom = false;
        if (options && options.hasOwnProperty('rom')) {
            this.rom = options.rom;
        }
        this.debug("Xtor Packager id=" + this.objectId);
        this.appCount = 0;
        this.services = [];
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
                    excludeFromApp.bind(this),
                    rewriteSourcePaths.bind(this),
                    createPackageDir.bind(this),
                    fillPackageDir.bind(this),
                    checkServiceInfo.bind(this),
                    loadServiceInfo.bind(this),
                    createServiceDir.bind(this),
                    copyService.bind(this),
                    addServiceInPkgInfo.bind(this),
                    removeServiceFromAppDir.bind(this),
                    outputPackage.bind(this, destination),
                    cleanupTmpDir.bind(this)
                ], function(err, results) {
                    if (err) {
                        // TODO: call cleanupTmpDir() before returning
                        next(err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    next(null, {ipk: this.ipk});
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

    function Service() {
        this.srcDir = "";
        this.dstDir = "";
        this.valid = false;
        this.serviceInfo = "";
        this.dirName = "";
    }

    // Private functions

    function loadAppInfo(next) {
        this.debug("loadAppInfo");
        var filename = path.join(this.appDir, "appinfo.json");
        fs.readFile(filename, function(err, data) {
            try {
                this.debug("APPINFO >>" + data + "<<");
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
                next();
            } catch(err) {
                next(err);
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
        if (this.minify === true) {
            var deployJs = this.deployscript || path.join(this.appDir, "enyo/tools/deploy.js");
            if (fs.existsSync(deployJs)) {
                var deployArgs = [path.resolve(deployJs)];
                // Add source mapping arguments
                if (this.appinfo.onDeviceSource) {
                    for (var from in this.appinfo.onDeviceSource) {
                        var to = this.appinfo.onDeviceSource[from];
                        deployArgs.push("-f", from, "-t", to);
                    }
                }
                // If we're specifying an alternative enyo directory, make sure lib still points to the app
                if (this.deployscript) {
                    deployArgs.push("-l", path.join(this.appDir, "lib"));
                }
                var subProcess = spawn('node', deployArgs, {cwd: this.appDir});

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

                    console.log("Packaging minified output: " + desti);
                    this.appDir = desti;
                    next();
                }.bind(this));
                return;
            } else if (this.deployscript) {
                next("Deploy script '" + this.deployscript + "' not found.")
            }
        }
        next();
    }

    function copyApp(next) {
        this.debug("copyApp");
        var files = shelljs.ls(this.appDir);
        files.forEach(function(file) {
            try {
                shelljs.cp('-r', path.join(this.appDir, file), this.applicationDir);
            } catch(err) {
                next(err);
            }
        }, this);
        next();
    }

    function excludeFromApp(next) {
        this.debug("excludeFromApp");
        this.excludedir.forEach(function(file) {
            try {
                shelljs.rm('-rf', path.join(this.applicationDir, file));
            } catch(err) {
                next(err);
            }
        }, this);
        next();
    }

    function rewriteSourcePaths(next) {
        this.debug("rewriteSourcePaths");
        if (this.appinfo.onDeviceSource) {
            try {
                var file = path.join(this.applicationDir, this.appinfo.main);
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
                next(err);
            }
        }
        next();
    }

    function createPackageDir(next) {
        this.debug("createPackageDir");
        if (!this.rom) {
            this.packageDir = path.join(this.tempDir, "data/usr/palm/packages", this.appinfo.id);
            this.debug("package dir = " + this.packageDir);
            mkdirp(this.packageDir, next);
        } else {
            next();
        }
    }

    function fillPackageDir(next) {
        this.debug("fillPackageDir");

        if (!this.rom) {
            // Copy icon file
            var filename = path.join(this.appDir, this.appinfo.icon);
            this.debug("Copying: " + filename + " to " + this.packageDir);
            try {
                shelljs.cp(filename, this.packageDir);
            } catch(err) {
                next(err);
                return;
            }

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
            this.debug("Generating package.json: " + data);
            fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
        } else {
            next();
        }
    }

    function outputPackage(destination, next) {
        if (this.rom) {
            shelljs.cp('-Rf', path.join(this.tempDir, "data/*"), destination);
            next();
        } else {
            async.series([
                makeTgz.bind(this,'data','data.tar.gz'),
                createCtrlDir.bind(this),
                createControlFile.bind(this),
                makeTgz.bind(this,'ctrl','control.tar.gz'),
                createDebianBinary.bind(this),
                removeExistingIpk.bind(this, destination),
                makeIpk.bind(this, destination)
            ], function(err, results) {
                if (err) {
                    next(err);
                    return;
                }
                next();
            });
        }
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
			.on("close", next)
		        .on('error', next);

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
		var filename = this.appinfo.id + "_" + this.appinfo.version + "_all.ipk";
        this.ipk = path.join(destination, filename);
        this.debug("makeIpk in dir " + destination + " file " + filename );

        if (this.nativecmd) {           // TODO: TBR
            shelljs.cd(this.tempDir);
            shelljs.exec("ar -q " + this.ipk + " debian-binary control.tar.gz data.tar.gz", {silent: this.silent});

            console.log("Creating package " + filename + " in " + destination);

            next();
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
                this.debug('Addind a filler for file ' + f);
                arStream.append('\n');
            }
		}, this);

		arStream.pipe(ipkStream) ;

		ipkStream.on('close', function() {
			console.log("Creating package " + filename + " in " + destination);
			next();
		});
		ipkStream.on('error', next);
    }

    function cleanupTmpDir(next) {
        this.debug("cleanupTmpDir");
        if (this.noclean) {
            console.log("Skipping removal of  " + this.tempDir);
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
                this.originAppDir = directory;
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

    /** 
        check services.json file under checkDir (only check 1-depth dir)
            1. check subdir in 1-depth under appDir
            2. check whether subdir contains services.json file
    */
    function checkServiceInfo(next) {
		var checkDir = path.join(this.originAppDir, "services");
		try {
			if( ! fs.existsSync(checkDir)) {
				checkDir = this.originAppDir;
			}
			var fileList = fs.readdirSync(checkDir);
			for(var idx in fileList) {
				var subDir = path.join(checkDir, fileList[idx]);
				var stat = fs.statSync(subDir);
				if( ! stat.isDirectory() ) {
					continue;
				}
				var serviceInfoFile = path.join(subDir, "services.json");
				if(fs.existsSync(serviceInfoFile)) {
					var svc = new Service();
					svc.srcDir = subDir;
					svc.dirName = fileList[idx];
					this.services.push(svc);
				}
			}
		} catch(err) {
			next(err);
		}
		this.debug("num of services: " + this.services.length);
        next();
    }

    //* read services.json recursivly
    function loadServiceInfo(next) {
		for(var idx in this.services) {
			var filename = path.join(this.services[idx].srcDir, "services.json");
			try {
				var data = fs.readFileSync(filename);
				this.services[idx].serviceInfo = JSON.parse(data);
				this.services[idx].valid = true;
			} catch(err) {
				console.error(err);
				next(err);
			}			
		}
		this.debug("num of serviceInfo: " + this.services.length);
		next();
	}

    /** 
        1. create dir (tmp) + data/usr/palm/services/
        2. create dir each service's id
            2-1) (tmp) + data/usr/palm/services/serviceInfos[0].id
            2-2) (tmp) + data/usr/palm/services/serviceInfos[1].id
    */
    function createServiceDir(next) {
		this.serviceDirs = [];
		for(var idx in this.services) {
			if(this.services[idx].valid === false)
				continue;
			var serviceDir = path.join(this.tempDir, "data/usr/palm/services", this.services[idx].serviceInfo.id);
			this.services[idx].dstDir = serviceDir;
			try {
				mkdirp.sync(serviceDir);
			} catch(err) {
				console.error(err);
				next(err);
			}
		}
		next();
	}

    //* copy service files into each serviceInfos[x].id directory.
    function copyService(next) {
		for(var idx in this.services) {
			if(this.services[idx].valid === false)
				continue;
			var files = shelljs.ls(this.services[idx].srcDir);
			files.forEach(function(file) {
				try {
					shelljs.cp('-r', path.join(this.services[idx].srcDir, file), this.services[idx].dstDir);
				} catch(err) {
					console.error(err);
					next(err);
                    return;
				}
			}, this);
		}
		next();
	}

	//* add service info into packageinfo.json.
    function addServiceInPkgInfo(next) {
		var filename = path.join(this.packageDir, "packageinfo.json");
		var pkginfo;
		try {
			var data = fs.readFileSync(filename);
			var validServiceCount = 0;
			this.debug("PACKAGEINFO >>" + data + "<<");
			pkginfo = JSON.parse(data);
		} catch(err) {
			console.error(err);
			next(err);
		}
		var serviceNames = [];
		var validServices = this.services.filter(function(s) {return s.valid;}).forEach(function(service){
			serviceNames.push(service.serviceInfo.id);
			validServiceCount++;
		});
		if(validServiceCount > 0) {
			pkginfo["services"] = serviceNames;
			var data = JSON.stringify(pkginfo, null, 2) + "\n";
			this.debug("Modified package.json: " + data);
			fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
		}
		else {
			next();
		}
    }

    //*	remove service dir from tmp source dir before packaging
    function removeServiceFromAppDir(next) {
		var checkDir = this.applicationDir;
		var needRmCheckDir = false;
		var fileList = fs.readdirSync(checkDir);
		if('services' in fileList) {
			checkDir = path.join(this.applicationDir, 'services');
			fileList = fs.readdirSync(checkDir);
			needRmCheckDir = true;
		}
		if(needRmCheckDir === true) {
			try {
				shelljs.rm('-rf', checkDir);
			} catch(err) {
				console.log("ERROR:" + err);
			}
		}
		else {
			for(var idx in this.services) {
				var dirName = this.services[idx].dirName;
				fileList.forEach(function(dir) {
					if(dirName === dir) {
						try {
							var rmDir = path.join(this.applicationDir, this.services[idx].dirName);
							shelljs.rm('-rf', rmDir);
						} catch(err) {
							console.log("ERROR:" + err);
						}
					}
				}, this);
			}
		}
		next();
    }
}());

