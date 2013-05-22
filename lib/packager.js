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
		this.services = []; //ByJunil
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
					checkServiceInfo.bind(this),	//ByJunil
					loadServiceInfo.bind(this),		//ByJunil
					createServiceDir.bind(this),	//ByJunil
					copyService.bind(this),			//ByJunil
					addServiceInPkgInfo.bind(this),	//ByJunil
					removeServiceFromAppDir.bind(this),	//ByJunil
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

	//ByJunil
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

                    console.log("Packaging minified output: " + desti);
					this.originAppDir = this.appDir; //ByJunil
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
		    try {
			    shelljs.cp('-r', path.join(this.appDir, file), this.applicationDir);
		    } catch(err) {
			    next(err);
		    }
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

	//ByJunil
    function checkServiceInfo(next) {
		// TODO: 
		//		1. check services or service folder existance
		//		2. if (services folder)
		//			2-1) check whether containing sub folders
		//			2-2) check sub folder containing services.json file
		//		3. else if (service folder)
		//			3-1) check folder containing services.json file
		var checkDir = path.join(this.originAppDir, "services");
		if( ! fs.existsSync(checkDir)) {
			checkDir = this.originAppDir;
		}

		//check services.json file under checkDir (only check 1-depth dir)
		//	1. check subdir in 1-depth under appDir
		//	2. check whether subdir contains services.json file
		var fileList = fs.readdirSync(checkDir);
		for(var idx in fileList) {
			var subDir = path.join(checkDir, fileList[idx]);
			var stat = fs.statSync(subDir);
			if( ! stat.isDirectory() ) {
				continue;
			}
			var serviceInfoFile = path.join(subDir, "services.json");
			if( fs.existsSync(serviceInfoFile)) {
				var svc = new Service();
				svc.srcDir = subDir;
				svc.dirName = fileList[idx];
				this.services.push(svc);
			}
		}
		this.debug("num of services: " + this.services.length);
        next();
    }

    function loadServiceInfo(next) {
		// TODO:
		//		1. read services.json recusivly
		for(var idx in this.services) {
			var filename = path.join(this.services[idx].srcDir, "services.json");
			var data = fs.readFileSync(filename);
			try {
				this.services[idx].serviceInfo = JSON.parse(data);
				this.services[idx].valid = true;
			} catch(err) {
				console.log("ERROR:" + err);
			}			
		}
		this.debug("num of serviceInfo: " + this.services.length);
		next();
	}

    function createServiceDir(next) {
		// TODO:
		//		1. create dir (tmp) + data/usr/palm/services/
		//		2. create dir each service's id
		//				2-1) (tmp) + data/usr/palm/services/serviceInfos[0].id
		//				2-2) (tmp) + data/usr/palm/services/serviceInfos[1].id
		this.serviceDirs = [];
		for(var idx in this.services) {
			if(this.services[idx].valid === false)
				continue;
			var serviceDir = path.join(this.tempDir, "data/usr/palm/services", this.services[idx].serviceInfo.id);
			this.services[idx].dstDir = serviceDir;
			mkdirp.sync(serviceDir);
		}

		next();
	}

    function copyService(next) {
		// TODO:
		//		1. copy service files into each serviceinfo[x].id directory
		for(var idx in this.services) {
			if(this.services[idx].valid === false)
				continue;
			var files = shelljs.ls(this.services[idx].srcDir);
			files.forEach(function(file) {
				try {
					shelljs.cp('-r', path.join(this.services[idx].srcDir, file), this.services[idx].dstDir);
				} catch(err) {
					console.log("ERROR:" + err);
				}
			}, this);
		}
		next();
	}

	function addServiceInPkgInfo(next) {
		// TODO:
		//		1. add service info into packageinfo.json
		var filename = path.join(this.packageDir, "packageinfo.json");
		var pkginfo;
		var data = fs.readFileSync(filename);
		this.debug("PACKAGEINFO >>" + data + "<<");
		try {
			pkginfo = JSON.parse(data);
		} catch(err) {
			console.log("ERROR:" + err);
		}
		var serviceNames = []
		for(var idx in this.services) {
			if(this.services[idx].valid === false)
				continue;
			serviceNames.push(this.services[idx].serviceInfo.id);
		}
		pkginfo["services"] = serviceNames;
		var data = JSON.stringify(pkginfo, null, 2) + "\n";
		this.debug("Modified package.json: " + data);
		fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
	}

	function removeServiceFromAppDir(next) {
		//TODO: 
		//	1. remove service dir from tmp source dir before packaging
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
