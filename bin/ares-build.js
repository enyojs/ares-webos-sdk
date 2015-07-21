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
    // return finish("This command does not support this platform. This command only works in linux");
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
        //help.format("--level <LEVEL>", "Tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
        help.format("-v", "verbose logging"),
        help.format("-h, --help", "Display this help"),
        help.format("-V, --version", "Display version info"),
        "",
        "EXAMPLES",
        "# Build native templates",
        processName + " ~/projects/app",
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
        _checkCmdAvailable.bind(this, 'cmake'),
        _checkCmdAvailable.bind(this, 'make'),
        _makeDirForCmake,
        _runCmake,
        _runMake,
        _postAction
    ], function(err) {
        next(err, {msg:"Success"});
    });

    function _makeDirForCmake(next) {
        log.info("runBuild():","_makeDirForCmake()");
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
        log.info("runBuild():","_runCmake()");
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
        cmakePrc.on('error', function(err) {
            return next(err);
        });
        cmakePrc.on('close', function(code) {
            if (code !== 0) {
                return next(new Error("cmake exits with code(" + code + ")"));
            }
            next();
        });
    }
    function _runMake(next) {
        log.info("runBuild():","_runMake()");
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
        makePrc.on('error', function(err) {
            return next(err);
        });
        makePrc.on('close', function(code) {
            if (code !== 0) {
                return next(new Error("make exits with code(" + code + ")"));
            }
            next();
        });
    }
    function _postAction(next) {
        log.info("runBuild():","_postAction()");
        console.log("DONE");
        next();
    }

    function _checkCmdAvailable(chkCmd, next) {
        log.info("runBuild():","_checkCmdAvailable()");
        var cmd = "if ! type " + chkCmd + " > /dev/null; then echo 1; else echo 0; fi;";
        exec(cmd, function (err, stdout, stderr) {
            if (err) return next(err);
            var notFound = stdout.toString().trim();
            if (notFound == "1") {
                return next(new Error(chkCmd + " command is not available in this platform"));
            } else {
                setImmediate(next);
            }
        });
    }
}

function finish(err, value) {
    log.info("runBuild():","finish()");
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
    log.error("*** " + processName + ": "+ err.toString());
    log.info('uncaughtException', err.stack);
});
