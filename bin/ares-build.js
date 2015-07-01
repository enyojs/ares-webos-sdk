var fs      = require('fs'),
    path    = require("path"),
    log     = require('npmlog'),
    nopt    = require('nopt'),
    async   = require('async'),
    spawn   = require('child_process').spawn,
    exec   = require('child_process').exec,
    inquirer = require('inquirer'),
    util    = require('util'),
    shelljs = require('shelljs'),
    source  = require('shell-source'),
    mkdirp  = require('mkdirp'),
    versionTool = require('./../lib/version-tools'),
    cliControl  = require('./../lib/cli-control'),
    cliData     = require('./../lib/cli-appdata').create('.ares'),
    help        = require('./../lib/helpFormat');

shelljs.config.fatal = true;  // Abort on all shelljs errors (e.g. cp/rm/mkdir)
/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
    log.error('uncaughtException', err.stack);
    cliControl.end(-1);
});

if (process.argv.length === 2) {
    process.argv.splice(2, 0, '--help');
}
var idx;
if ((idx = process.argv.indexOf('--chip')) !== -1 || (idx = process.argv.indexOf('-i')) !== -1) {
    if (process.argv[idx+1] && process.argv[idx+1].toString().match(/^-/)) {
        process.argv.splice(idx+1, 0, 'true');
    }
}
/**********************************************************************/

var knownOpts = {
    "version":  Boolean,
    "help":     Boolean,
    "ndkpath":  String,
    "arch":     String,
    "chip":     String,
    "configure":    String,
    "level":    ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
    "V": ["--version"],
    "h": ["--help"],
    "n": ["--ndkpath"],
    "a": ["--arch"],
    "i": ["--chip"],
    "c": ["--configure"],
    "v": ["--level", "verbose"]
};
var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-build.js'*/);
/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/

if (argv.help) {
    showUsage();
    cliControl.end();
}

log.verbose("argv", argv);

var op;
if (argv['version']) {
    versionTool.showVersionAndExit();
} else {
    op = runBuild;
}

if (process.platform !== "linux") {
    return finish("This command does not support this platform. This command only works in linux");
}
//FIXME: more proper code?
if (argv.arch) {
    if (['x86', 'arm'].indexOf(argv.arch) === -1) {
        return finish("--arch option should be one of '" + ['x86', 'arm'].join(', ') + "'");
    }
}
if (argv.configure) {
    if (['DEBUG', 'RELEASE'].indexOf(argv.configure.toUpperCase()) === -1) {
        return finish("--configure option should be one of '" + ['Debug', 'Release'].join(', ') + "'");
    }
}
if (argv.argv.remain.length > 1) {
    return finish("Please check arguments");
}
var buildDir = argv.argv.remain[0];

/**********************************************************************/

if (op) {
    versionTool.checkNodeVersion(function(err) {
        op(finish);
    });
}

function showUsage() {
    var helpString = [
        "",
        "NAME",
        help.format(processName + " - Build Native App or Service template"),
        "",
        "SYNOPSIS",
        help.format(processName + " [OPTION...] <DIR>"),
        "",
        // "OPTION",
        // help.format("-a, --arch", "x86 | arm"),
        // help.format("-i, --chip", "default | h15 | lm15u | m14 | <String>"),
        // help.format("-c, --configure", "Debug | Release"),
        // help.format("-n, --ndkpath", "<webOS NDK Path>"),
        // "",
        help.format("-h, --help", "Display this help"),
        help.format("-V, --version", "Display version info"),
        "",
        "EXAMPLES",
        "# Build native templates",
        processName + " ~/projects/app",
        // "",
        // "# Build native templates with specifying ndk path",
        // processName + " -n /opt/webosndk ~/projects/app",
        // "",
        // "# Build native templates configured with debugging mode for arm",
        // processName + " -n /opt/webosndk -c Debug -a arm ~/projects/app",
        ""
    ];
    help.print(helpString);
}

function runBuild(next) {
    if (!buildDir) {
        return finish("Please check the app or service directory path to build");
    }
    var cliDataPath = cliData.getPath();
    var buildConf = {}; /* ndkPath, arch, configure */

    async.series([
        // _checkNDK,
        // _queryNDKPath,
        // _applyEnvForNDK,
        _makeDirForCmake,
        _loadAppInfo,
        _findCMakeOutDir,
        _runCmake,
        _runMake,
        _copyEssentialFilesToOutDir,
        _postAction
    ], function(err) {
        next(err, {msg:"Success"});
    });

    function _loadAppInfo(next) {
        log.info("_loadAppInfo()");
        //TODO: Get the following properties
        var self = this;
        self.essential = {};
        var defaultAssetsFields = {
            "main": true,
            "icon": true,
            "largeIcon": true,
            "bgImage": true,
            "splashBackground": true,
            "imageForRecents": true,
            "sysAssetsBasePath": true
        };
        var appinfoFilePath = path.join(buildDir, "appinfo.json");
        if (!fs.existsSync(appinfoFilePath)) {
            log.info("_loadAppInfo()", "No appinfo.json in " + buildDir);
            return next();
        }
        try {
			self.essential['appinfo'] = appinfoFilePath;
            fs.readFile(appinfoFilePath, function(err, data) {
                if (err) return next(err);
                var appinfo = JSON.parse(data);
                for (prop in defaultAssetsFields) {
                    if (defaultAssetsFields[prop] && appinfo.hasOwnProperty(prop)) {
                        var file = path.join(buildDir, appinfo[prop]);
                        self.essential[prop] = file;
                    }
                }
            });
        } catch(err) {
            return next(err);
        }
        next();
    }

    function _findCMakeOutDir(next) {
        var self = this;
        self.outDir = null;
        //TODO: Parse CMakeLists.txt and get CMAKE_RUNTIME_OUTPUT_DIRECTORY value
        //      set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/pkg/")
        var CMakeListsFilePath = path.join(path.resolve(buildDir), 'CMakeLists.txt');
        if (!fs.existsSync(CMakeListsFilePath)) {
            return next();
        }
        try {
            fs.readFile(CMakeListsFilePath, function(err, data) {
                var str;
                if (err) return next(err);
                if (Buffer.isBuffer(data)) {
                    str = data.toString();
                } else {
                    str = data;
                }
                str.split(/\r?\n/).forEach(_onLine);
                next();
            });
        } catch(err) {
            return next(err);
        }

        function _onLine(line) {
            if (self.outDir) return;
            if (line.indexOf('CMAKE_RUNTIME_OUTPUT_DIRECTORY') !== -1) {
                var words = line.split(/\s/);
                for (idx=0; idx < words.length; idx++) {
                    if (words[idx].indexOf('CMAKE_RUNTIME_OUTPUT_DIRECTORY') !== -1) {
                        if (outDir = words[idx + 1]) {
                            if (outDir.lastIndexOf(')') !== -1) {
                                outDir = outDir.substring(0, outDir.lastIndexOf(')'));
                            }
                            outDir = outDir.replace(/\$(\{|\()*CMAKE_SOURCE_DIR(\}|\))*/g, buildDir).replace(/\"/g,'');
							outDir = path.resolve(outDir);
							log.info("_findCMakeOutDir()#_onLine","outDir:", outDir); 
							if (fs.existsSync(outDir)) {
								log.info("_findCMakeOutDir()#_onLine","outDir exist"); 
                            	self.outDir = path.resolve(outDir);
								break;
							}
                        }
                    }
                }
            }
        }
    }

    function _copyEssentialFilesToOutDir(next) {
        var self = this;
        if (self.essential && self.outDir) {
            mkdirp.sync(self.outDir);
            for (prop in self.essential) {
				log.info("_copyEssentialFilesToOutDir()#file:", self.essential[prop]); 
                if (fs.existsSync(self.essential[prop])) {
					log.info("_copyEssentialFilesToOutDir()#", self.essential[prop], "=>", self.outDir); 
                    shelljs.cp('-rf', self.essential[prop], self.outDir);
                }
            }
        }
        next();
    }

    function _checkNDK(next) {
        // Check NDK installation path
        this.buildConfigFile = path.join(cliDataPath, 'buildConfig.json');
        if (!fs.existsSync(this.buildConfigFile)) {
            return next();
        }
        fs.readFile(this.buildConfigFile, function(err, data) {
            buildConf = JSON.parse(data);
            next();
        });
    }
    function _queryNDKPath(next) {
            self = this;
            var questions = [{
              type: "input",
              name: "ndkPath",
              message: "installed webOS-NDK Path:",
              default: function() {
                    return "/opt/webosndk";
              },
              validate: function(input) {
                    var done = this.async();
                    if (input.length < 1 || !fs.existsSync(input)) {
                        return done("Please check webOS-NDK Path");
                    }
                    done(true);
              },
              when: function(answers) {
                 return (typeof buildConf["ndkPath"] === 'undefined' && !argv.ndkpath)?true : false;
              }
            },
            { type: "list",
              name: "arch",
              message: "arch:",
              choices: ["x86", "arm"],
              default: function() {
                 return 0;
              },
              when: function(answers) {
                 return (typeof buildConf["arch"] === 'undefined' && !argv.arch)? true : false;
              }
            },
            { type: "list",
              name: "chip",
              message: "arch:",
              choices: ["default", "h15", "m15", "m14", "etc"],
              default: function() {
                 return 0;
              },
              when: function(answers) {
                 return (typeof buildConf["chip"] === 'undefined' && !argv.chip)? true : false;
              }
            },
            { type: "input",
              name: "chip_etc",
              message: "chip (etc):",
              default: function() {
                    return "etc";
              },
              validate: function(input) {
                    var done = this.async();
                    if (input.length < 1) {
                        return done("Please input valid child name.");
                    }
                    done(true);
              },
              when: function(answers) {
                 return (typeof buildConf["chip"] === 'undefined' && !argv.chip && argv.chip === "etc")?
                    true : false;
              }
            },
            { type: "list",
              name: "configure",
              message: "configure:",
              choices: ["Debug", "Release"],
              default: function() {
                 return 0;
              },
              when: function(answers) {
                 return (typeof buildConf["configure"] === 'undefined' && !argv.configure)? true : false;
              }
            }
        ];
        inquirer.prompt(questions, function(answers) {
            buildConf["ndkPath"] = (argv.ndkpath = argv.ndkpath || answers.ndkPath || buildConf["ndkPath"]);
            buildConf["arch"] = (argv.arch = argv.arch || answers.arch || buildConf["arch"]);
            if (answers.chip === "etc" && !answers.chip_etc) {
                answers.chip = answers.chip_etc;
            }
            if (argv.chip === "true") argv.chip = "default";
            buildConf["chip"] = (argv.chip = argv.chip || answers.chip || buildConf["chip"]);
            buildConf["configure"] = (argv.configure = argv.configure || answers.configure || buildConf["configure"]);
            console.log("************************************************************");
            console.log("[" + processName + "] --ndkpath: " + buildConf["ndkPath"]);
            console.log("[" + processName + "] --arch: " + buildConf["arch"]);
            console.log("[" + processName + "] --chip: " + buildConf["chip"]);
            console.log("[" + processName + "] --configure: " + buildConf["configure"]);
            console.log("[" + processName + "] " + "Saving ndk path in " + self.buildConfigFile);
            console.log("************************************************************");
            fs.writeFileSync(self.buildConfigFile, JSON.stringify(buildConf, null, "\t"));
            next();
        });
    }
    function _applyEnvForNDK(next) {
        async.waterfall([
            _queryMachineArch,
            _findEnvFile,
            source.bind(this)
        ], function(err) {
            next(err);
        });
        function _findEnvFile(machine, next) {
            if (!machine) {
                return next(new Error('Undefined machine name'));
            }
            var suffixEnvFileName = (buildConf["chip"] === 'default')? '' : '-' + buildConf["chip"];
            var envFileName = "env_toolchain_linux_" + machine + '-'+ buildConf["arch"] + suffixEnvFileName;
            var envFilePath = path.join(buildConf["ndkPath"], envFileName);
            if (!fs.existsSync(envFilePath)) {
                return next(new Error("Cannot find " + envFilePath));
            }
            console.log("Loading env file from " + envFilePath);
            next(null, envFilePath);
        }

        function _queryMachineArch(next) {
            var cmd = "uname -m";
            var machines = ['x86_64', 'x86'];
            exec(cmd, function (err, stdout, stderr) {
                            var machine = stdout.toString().trim();
                            machine = machine.replace(/i.+86$/g, 'x86');
                            machine = machine.replace(/x86[-_]64$/g, 'x86_64');
                            console.log("machine:", machine);
                            if (machines.indexOf(machine) !== -1) {
                                next(null, machine);
                            } else {
                                next(new Error('Unsupported machine(' + machine + ')'));
                            }
            });
        }
    }

    function _makeDirForCmake(next) {
        this.tmpCmakeDir = path.join(path.resolve(buildDir), 'BUILD_CMAKE');
        if (fs.existsSync(this.tmpCmakeDir)) {
            console.log("[" + processName + "] " + this.tmpCmakeDir + " is already existing...");
            console.log("[" + processName + "] Removing files in " + this.tmpCmakeDir);
            shelljs.rm('-rf', path.join(this.tmpCmakeDir, '*'));
        } else {
            console.log("[" + processName + "] Making a 'BUILD_CMAKE' directory " + this.tmpCmakeDir);
            mkdirp.sync(this.tmpCmakeDir);
        }
        next();
    }
    function _runCmake(next) {
        console.log("[" + processName + "] Running cmake in " + this.tmpCmakeDir);
        var options = ['..'];
        if (buildConf["configure"]) {
            options.push("-DCMAKE_BUILD_TYPE=" + buildConf["configure"].toUpperCase());
        }
        console.log("[" + processName + "] cmake " + options.join(' '));
        var cmakePrc = spawn('cmake', options, {cwd:this.tmpCmakeDir});
        cmakePrc.stdout.on('data', function(data) {
            console.log(data.toString());
        });
        cmakePrc.stderr.on('data', function(data) {
            console.warn(data.toString());
        });
        cmakePrc.on('close', function(code) {
            if (code !== 0) {
                return next(new Error("cmake exits with code(" + code + ")"));
            }
            next();
        });
    }
    function _runMake(next) {
        console.log("[" + processName + "] Running make in " +  this.tmpCmakeDir);
        var options = [];
        console.log("[" + processName + "] make " + options.join(' '));
        var makePrc = spawn('make', options, {cwd:this.tmpCmakeDir});
        makePrc.stdout.on('data', function(data) {
            console.log(data.toString());
        });
        makePrc.stderr.on('data', function(data) {
            console.warn(data.toString());
        });
        makePrc.on('close', function(code) {
            if (code !== 0) {
                return next(new Error("make exits with code(" + code + ")"));
            }
            next();
        });
    }
    function _postAction(next) {
        console.log("DONE");
        next();
    }
}

function finish(err, value) {
    if (err) {
        log.error(err);
        log.verbose(err.stack);
        cliControl.end(-1);
    } else {
        if (value && value.msg) {
            console.log(value.msg);
        }
        cliControl.end();
    }
}

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
});
