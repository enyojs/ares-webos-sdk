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
    CombinedStream = require('combined-stream'),
    Rsync = require('rsync'),
    npmlog = require('npmlog');

(function () {
    var log = npmlog;
    log.heading = 'packager';
    log.level = 'warn';

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
        log.verbose("Xtor Packager id=" + this.objectId);
        this.appCount = 0;
        this.services = [];
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

                    // TODO: probably some more checkings are needed
                    if (this.appCount === 0) {
                        setImmediate(next, "ERROR: At least an APP_DIR must be specified");
                        return;
                    }
                    setImmediate(next);
                }.bind(this));
        },

        generatePackage: function(inDirs, destination, options, next) {
            log.verbose("generatePackage: from " + inDirs);

            async.series([
                    this.checkInputDirectories.bind(this, inDirs, options),
                    loadAppInfo.bind(this),
                    checkAppInfo.bind(this),
                    createTmpDir.bind(this),
                    createAppDir.bind(this),
                    minifyApp.bind(this),
                    copyApp.bind(this),
                    copyAssets.bind(this),
                    excludeRedundantDirFromApp.bind(this),
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
                        setImmediate(next, err);
                        return;
                    }

                    // TODO: probably some more checkings are needed
                    setImmediate(next, null, {ipk: this.ipk});
                }.bind(this));
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
        log.verbose("loadAppInfo");
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
        log.verbose("checkAppInfo: id: " + this.appinfo.id);
        setImmediate(next);
    }

    function createTmpDir(next) {
        log.verbose("createTmpDir");
        this.tempDir = temp.path({prefix: 'com.palm.ares.hermes.bdOpenwebOS'}) + '.d';
        log.verbose("temp dir = " + this.tempDir);
        mkdirp(this.tempDir, next);
    }

    function createAppDir(next) {
        log.verbose("createAppDir");
        this.applicationDir = path.join(this.tempDir, "data/usr/palm/applications", this.appinfo.id);
        log.verbose("application dir = " + this.applicationDir);
        mkdirp(this.applicationDir, next);
    }

    function minifyApp(next) {
        log.verbose("minifyApp");
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
        try {
            if (process.platform === 'win32') {
                try {
                    shelljs.cp('-rf', src, dst);
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
                rsync.source(src)
                    .destination(dst);
                rsync.execute(next);
            }
        } catch(err) {
            setImmediate(next, err);
        }
    }

    function copyApp(next) {
        log.verbose("copyApp");
        copySrcToDst(path.join(this.appDir, '*'), this.applicationDir, next);
    }

    function copyAssets(next) {
        log.verbose("copyAssets");
        if (this.appinfo.assets) {
            this.appinfo.assets.forEach(function(file) {
                try {
                    shelljs.cp('-r', path.join(this.originAppDir, file), this.applicationDir);
                } catch(err) {
                    setImmediate(next, err);
                }
            }, this);
        }
        setImmediate(next);
    }

    function excludeRedundantDirFromApp(next) {
        log.verbose("excludeRedundantDirFromApp");
        if (this.minify !== true) {
            this.excludedir = this.excludedir.concat(['build', 'target']);
        } else {
            this.excludedir = this.excludedir.concat(['target']);
        }
        setImmediate(next);
    }

    function excludeFromApp(next) {
        log.verbose("excludeFromApp");
        var excludes = this.excludedir.concat(this.appinfo.exclude || []);
        excludes.forEach(function(file) {
            try {
                shelljs.rm('-rf', path.join(this.applicationDir, file));
            } catch(err) {
                setImmediate(next, err);
            }
        }, this);
        setImmediate(next);
    }

    function rewriteSourcePaths(next) {
        log.verbose("rewriteSourcePaths");
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
        setImmediate(next);
    }

    function createPackageDir(next) {
        log.verbose("createPackageDir");
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

        if (!this.rom) {
            // Copy icon file
            var filename = path.join(this.appDir, this.appinfo.icon);
            log.verbose("Copying: " + filename + " to " + this.packageDir);
            try {
                shelljs.cp(filename, this.packageDir);
            } catch(err) {
                setImmediate(next, err);
                return;
            }

            if (!this.pkgDir) {
            	// Generate packageinfo.json
                var pkginfo = {
                    "app": this.appinfo.id,
                    "icon": this.appinfo.icon,
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

    function outputPackage(destination, next) {
        if (this.rom) {
            shelljs.cp('-Rf', path.join(this.tempDir, "data/*"), destination);
            setImmediate(next);
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
                    setImmediate(next, err);
                    return;
                }
                setImmediate(next);
            });
        }
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

        //@see https://github.com/isaacs/node-tar/issues/7
        // it is a workaround for packaged ipk on windows can set +x into directory
        var fixupDirs = function(entry) {
            // Make sure readable directories have execute/write permission
            if (entry.props.type === "Directory")
                entry.props.mode |= (entry.props.mode >>> 2) & 0333;
                return true;
        }

		fstream
			.Reader( {path: inPath, type: 'Directory', filter: fixupDirs } )
			.pipe(tar.Pack({ noProprietary: true, pathFilter: filter }))
			.pipe(zlib.createGzip())
			.pipe(fstream.Writer( path.join(this.tempDir,output)))
			.on("close", next)
		        .on('error', next);

    }

    function removeExistingIpk(destination, next) {
        log.verbose("removeExistingIpk");

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
		var filename = this.appinfo.id + "_" + this.appinfo.version + "_all.ipk";
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
                log.verbose('Addind a filler for file ' + f);
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
        } else if (fs.existsSync(path.join(directory, "services.json")) || (path.basename(directory) == "services")) {
            this.svcDir = directory;
            callback();
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
		var checkDir = this.svcDir || path.join(this.originAppDir, "services");
		try {
			if( ! fs.existsSync(checkDir)) {
				checkDir = this.originAppDir;
			}
			var fileList = fs.readdirSync(checkDir);
			if (fileList.indexOf("services.json") > -1) {
				var svc = new Service();
				svc.srcDir = checkDir;
				svc.dirName = path.basename(checkDir);
				this.services.push(svc);
			} else {
				for (var idx in fileList) {
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
			}
		} catch(err) {
			setImmediate(next, err);
		}
		log.verbose("num of services: " + this.services.length);
        setImmediate(next);
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
				setImmediate(next, err);
			}			
		}
		log.verbose("num of serviceInfo: " + this.services.length);
		setImmediate(next);
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
				setImmediate(next, err);
			}
		}
		setImmediate(next);
	}

    //* copy service files into each serviceInfos[x].id directory.
    function copyService(next) {
        var validServices = this.services.filter(function(service) {
                                                    return service.valid;
                                                    });
        var completed = 0;
        validServices.forEach(function(service) {
            try {
                copySrcToDst(path.join(service.srcDir, '*'), service.dstDir, 
                    function(error, stdout, stderr){	
                        if (error) {
                            setImmediate(next, new Error("copyService:",error));
                        } else {
                            completed++;
                            if (validServices.length === completed) {
                                setImmediate(next);
                            }
                        }
                    });
            } catch(err) {
                setImmediate(next, err);
            }
        });
        if (validServices.length === 0) {
            setImmediate(next);
        }
    }

	//* add service info into packageinfo.json.
    function addServiceInPkgInfo(next) {
        if (!this.rom) {
            var filename = path.join(this.packageDir, "packageinfo.json");
            var pkginfo;
            try {
                var data = fs.readFileSync(filename);
                var validServiceCount = 0;
                log.verbose("PACKAGEINFO >>" + data + "<<");
                pkginfo = JSON.parse(data);
            } catch(err) {
                console.error(err);
                setImmediate(next, err);
            }
            var serviceNames = [];
            var validServices = this.services.filter(function(s) {return s.valid;}).forEach(function(service){
                serviceNames.push(service.serviceInfo.id);
                validServiceCount++;
            });
            if(validServiceCount > 0) {
                pkginfo["services"] = serviceNames;
                var data = JSON.stringify(pkginfo, null, 2) + "\n";
                log.verbose("Modified package.json: " + data);
                fs.writeFile(path.join(this.packageDir, "packageinfo.json"), data, next);
            } else {
                setImmediate(next);
            }
        }
        else {
            setImmediate(next);
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
		setImmediate(next);
    }
}());

