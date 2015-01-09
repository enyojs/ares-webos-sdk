var fs      = require('fs'),
    url     = require("url"),
    util    = require('util'),
    async   = require('async'),
    path    = require('path'),
    log     = require('npmlog'),
    vm      = require('vm'),
    shelljs = require('shelljs'),
    mkdirp  = require('mkdirp'),
    nopt    = require('nopt'),
    sprintf     = require('sprintf-js').sprintf,
    prjgen      = require('ares-generator'),
    versionTool = require('./../lib/version-tools'),
    cliControl  = require('./../lib/cli-control'),
    help        = require('./../lib/helpFormat'),
    errMsgHdlr  = require('./../lib/error-handler'),
    cliData  = require('./../lib/cli-appdata').create('.ares');

/**********************************************************************/
var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
    log.error("*** " + processName + ": "+ err.toString());
    log.info('uncaughtException', err.stack);
    cliControl.end(-1);
});

if (process.argv.length === 2) {
    process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var TMPL_FILE = path.resolve(path.join(path.dirname(process.argv[1]), '../ide-plugin.json'));
var DEF_BP_FILE = path.join(cliData.getPath(), 'baseBpVer.json');
var DEF_BP_VER = '2.5';
var DEF_SRC_TYPE = 'template';
var DEF_SVC_NAME = 'com.yourdomain.app.service';
var VER_FILES = {
    "moonstone" : "lib/moonstone/version.js",
    "garnet" : "lib/garnet/version.js",
    "sunstone" : "lib/sunstone/version.js"
}

var idx;
if ((idx = process.argv.indexOf('--list')) !== -1 || (idx = process.argv.indexOf('-l')) !== -1) {
    if (process.argv[idx+1] && process.argv[idx+1].toString().match(/^-/)) {
        process.argv.splice(idx+1, 0, DEF_SRC_TYPE);
    }
}

/**********************************************************************/
var knownOpts = {
    "help": Boolean,
    "hidden-help": Boolean,
    "version": Boolean,
    "list": String,
    "overwrite": Boolean,
    "servicename": String,
    "template": [String, Array],
    "property": [String, Array],
//    "proxy-url": url,
    "onDevice": String,
    "initialize": Boolean,
    "default-enyo": String,
    "level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var shortHands = {
    "h":        "--help",
    "hh": ["--hidden-help"],
    "V":        "--version",
    "l":        "--list",
    "f":        "--overwrite",
    "t":        "--template",
    "p":        "--property",
    "s":        "--servicename",
    "D":        "--onDevice",
    "de":       "--default-enyo",
//    "P":        "--proxy-url",
    "v":        ["--level", "verbose"]
};

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-install.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/

if (argv.help || argv['hidden-help']) {
    showUsage(argv['hidden-help']);
    cliControl.end();
}

var op;
if (argv.close) {
    op = close;
} else if (argv['version']) {
    versionTool.showVersionAndExit();
} else if (argv["default-enyo"]) {
    op = savDefVer;
} else if (argv.list || argv["default-enyo"]) {
    op = list;
} else if (argv.initialize) {
    op = initialize;
} else {
    op = generate;
}

var options = {
    overwrite: argv.overwrite,
    tmplNames: argv.template || [],
    listType: argv.list,
    appInfoProps: argv.property || [],
    svcName: argv.servicename,
    bpVer: argv.onDevice,
    defBpVer: argv["default-enyo"],
    dstPath: argv.argv.remain[0]
};

if (op) {
    versionTool.checkNodeVersion(function(err) {
        op(finish);
    });
}

function showUsage(hiddenFlag) {
    var helpString = [
        "",
        "NAME",
        help.format(processName + " - Create webOS app projects from templates"),
        "",
        "SYNOPSIS",
        help.format(processName + " [OPTION...] <APP_DIR>"),
        help.format("\t APP_DIR is the application directory. It will be created if it does not exist."),
        "",
        "OPTION",
        help.format("-t,--template <TEMPLATE>", "specify TEMPLATE to use"),
        help.format("", "TEMPLATE can be listed via " + processName + " --list, -l"),
        "",
        help.format("-l, --list <TYPE>"),
        help.format("\t List the available templates corresponding with TYPE [default: " + DEF_SRC_TYPE + "]"),
        help.format("\t Available TYPE is 'template', 'webosService', 'appinfo'"),
        "",
        help.format("-p, --property <PROPERTY>", "Set the properties of appinfo.json"),
        help.format("\t PROPERTY can be one of the following forms"),
        help.format("win32", "\t (e.g.) -p \"{'id': 'com.examples.helloworld', 'version':'1.0.0', 'type':'web'}\""),
        help.format(["linux", "darwin"], "\t (e.g.) -p '{\"id\": \"com.examples.helloworld\", \"version\":\"1.0.0\", \"type\":\"web\"}'"),
        help.format("\t (e.g.) -p \"id=com.examples.helloworld\" -p \"version=1.0.0\" -p \"type=web\""),
        "",
        help.format("-D, --onDevice <ENYO-VERSION>"),
        help.format("\t ENYO-VERSION is enyo framework version to use"),
        help.format("\t This option is applied to 'enyoVersion', 'onDeviceSource' field in appinfo.json"),
        "",
        help.format("-s, --servicename <SERVICENAME>", "Set the servicename for webOS Service"),
        help.format("\t (e.g.) -s \"com.examples.helloworld.service\""),
        "",
        help.format("-f, --overwrite", "Overwrite existing files [boolean]"),
        "",
        help.format("-de, --default-enyo <ENYO-VERSION>"),
        help.format("\t Set default enyo framework version in the templates"),
        "",        
        help.format("--level <LEVEL>", "Tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
        help.format("-h, --help", "Display this help"),
        help.format("-V, --version", "Display version info"),
        //      help.format("--proxy-url, -P", "Use the given HTTP/S proxy URL [url]"),
        "",
        "DESCRIPTION",
        "",
        help.format("PROPERTY defines properties to be used during generation."),
        help.format("Properties can be specified as key-value pairs of the form \"key=value\""),
        help.format("or as JSON objects of the form '{\"key1\":\"value1\", \"key2\":\"value2\", ...}'."),
        help.format("Surrounding quotes are required in both cases."),
        "",
        "EXAMPLES",
        "",
        "# Create an app with id 'com.domain.app'",
        processName + " -t bootplate-web -p \"id=com.domain.app\" ~/projects/app",
        "",
        "# Create an webOS service named 'com.domain.app.service'",
        processName + " -t webos-service -s com.domain.app.service ~/projects/service",
        ""
    ];

    var hiddenhelpString = [
        "",
        "EXTRA-OPTION",
        help.format("--initialize", "Initialize ares-generate command."),
        help.format("", "Make copies of bootplate templates in CLI data directory"),
        "EXAMPLES",
        "",
        "# Initialize ares-generate command",
        processName+" --initialize",
        "",
    ];

    help.print(helpString);
    if (hiddenFlag) {
        help.print(hiddenhelpString);
    }
}

function initialize() {
    log.info("initialize");
    var self = this;
    async.waterfall([
        _getTransMaps.bind(self),
        _copyTempl.bind(self, true),
        function(transMap, next) {
        	_rmDefVer(next);
        }
    ], function(err) {
        finish(err, {msg: "Success"});
    });
}

function savDefVer() {
    log.info("savDefVer");
    var self = this;
    async.waterfall([
        _getTransMaps.bind(self),
        _loadTemplConf.bind(self),
        _checkOptions.bind(self),
        _savDefVer.bind(self)
    ], function(err) {
        finish(err, {msg:"Success"});
    });
}


function list() {
    log.info("list");
    var self = this;
    var _display = function (type, next) {
        if (type == 'true') {
            type = DEF_SRC_TYPE;
        }
        this.tmplConf.sources.forEach(function(source) {
            if (source.type === type) {
                console.log(sprintf("%-40s\t%-10s\t%s %s", source.id, source.version, source.description, source.isDefault ? "(default)" : ""));
            }
        });
        setImmediate(next);
    }

    async.waterfall([
        _getTransMaps.bind(self),
        _loadTemplConf.bind(self),
        _checkOptions.bind(self),
        _display.bind(self, options.listType)
    ], function(err) {
        finish(err);
    });
}

function generate() {
    log.info("generate");
    var self = this;
    var _genApp = function (options, substitutions, next) {
        log.silly("_genApp#substitutions:", substitutions);
        self.tmplConf.level = log.level;
        async.waterfall ([
            function (next) {
                new prjgen.Generator(this.tmplConf, next);
            },
            function (generator, next) {
                console.log("Generating " + options.tmplNames.join(",") + " in " + path.resolve(options.dstPath));
                generator.generate(options.tmplNames, substitutions, options.dstPath, options, next);
            }
        ], function(err) {
            next(err);
        });
    }

    async.waterfall([
        _getTransMaps.bind(self),
        _copyTempl.bind(self, false),
        _loadTemplConf.bind(self),
        _checkOptions.bind(self),
        _substParams.bind(self),
        _genApp.bind(self, options),
    ], function(err) {
        finish(err, {msg: "Success"});
    });
}

function finish(err, value) {
    log.info("finish():", "err:", err);
    if (err) {
        log.error(processName + ": "+ err.toString());
        log.verbose(err.stack);
        cliControl.end(-1);
    } else {
        if (value && value.msg) {
            console.log(value.msg);
        }
        cliControl.end();
    }
}

function _loadTemplConf(transMaps, next) {
    var self = this;
    self.tmplInfos = { /* "bootplate" : {"type":"template", "class":"moonstone", "version":"1.0.0", "default":false} */ };
    var _rplcLoclPath = function (data, next) {
        var objConf;
        try {
            data = data.replace(/@PLUGINDIR@/g, path.dirname(TMPL_FILE)).replace(/\\/g,'/');
            transMaps.forEach(function(map){
                 data = data.replace(new RegExp(map.from, "g"), map.to).replace(/\\/g,'/');
            });
            objConf = JSON.parse(data);
            self.tmplConf = objConf.services[1];
        } catch(e) {
            throw "Improper JSON: "+data;
        }
        setImmediate(next);
    };
    var _rplcVersion = function (next) {
        async.forEachSeries(self.tmplConf.sources, function(source, next) {
            var filePaths = [];
            if (source.files) {
                source.files.forEach(function(file){
                    filePaths = filePaths.concat(file.url || []);
                    if (file.symlink) {
                        var symlinks = Object.keys(file.symlink).map(function(key) {
                                        return file.symlink[key];
                                    });
                        filePaths = filePaths.concat(symlinks);
                    }
                });
                var exit = false;
                filePaths.forEach(function(fp){
                    if (exit) return;
                    transMaps.forEach(function(tm) {
                        if (fp.indexOf(tm.to) === 0) {
                            source.version = tm.version;
                            exit = true;
                            return;
                        }
                    });
                });                
            }
            next();
        }, function(err) {
            setImmediate(next, err);
        });
    };
    var _hookTmplConf = function (next) {
       async.forEachSeries(self.tmplConf.sources, function(source, next) {
            self.tmplInfos[source.id] = {
                type: source.type,
                class: source.class,
                version: source.version,
                isDefault: source.isDefault,
                onDevice: source.onDevice
            };
            next();
        }, function(err) {
            setImmediate(next, err);
        });
    };
    var _rplcDeps = function (next) {
        async.forEachSeries(self.tmplConf.sources, function(source, next) {
            if (options.bpVer) {
                var dotCnt = (options.bpVer.match(/\./g) || []).length;
                if (dotCnt > 1) {
                    var verTokens = options.bpVer.split(".");
                    options.bpVer = verTokens[0] + '.' + verTokens[1];
                    log.warn("Changing --onDevice value to " + options.bpVer);
                }
                if ((options.bpVer.match(/\-/g) || []).length > 0) {
                    options.bpVer = options.bpVer.split("-")[0];
                    log.warn("Changing --onDevice value to " + options.bpVer);
                }
            }
            if (source.class) {
                var savDefBpVer;
                if (fs.existsSync(DEF_BP_FILE)) {
                    savDefBpVer = fs.readFileSync(DEF_BP_FILE, 'utf8');
                }
                var bpVer = (options.bpVer || savDefBpVer|| source.version);
                var depName = source.class + '-' + bpVer;
                source.deps = source.deps || [];
                source.deps.push(depName);
                if (self.tmplInfos.hasOwnProperty(depName)) {
                    source.version = self.tmplInfos[depName].version;
                }
            }
            next();
        }, function(err) {
            setImmediate(next, err);
        });
    };
    async.waterfall([
        fs.readFile.bind(fs, TMPL_FILE, 'utf8'),
        _rplcLoclPath.bind(self),
        _rplcVersion.bind(self),
        _hookTmplConf.bind(self),
        _rplcDeps.bind(self)
    ], function(err) {
        setImmediate(next, err);
    });
}

function _getEnyoVersion (versionFilePath) {
    var includeInThisContext = function(path) {
        var code = fs.readFileSync(path);
        code = "var enyo={}; enyo.version=new Object(); enyo.mixin=function(){};" + code;
        vm.runInThisContext(code, path);
    };
    includeInThisContext(versionFilePath);
    var version;
    if (typeof enyo.version === 'object' && enyo.version != {}) {
        for (key in enyo.version) {
            if (typeof enyo.version[key] === 'string') {
                version = enyo.version[key];
                break;
            }
        }
    }
    return version;
}

function _getTransMaps (next) {
    var localTmplPath = path.join(path.dirname(TMPL_FILE), 'templates');
    var transMaps = [];
    var cliDataPath = cliData.getPath();

    async.waterfall([
        fs.readdir.bind(this, localTmplPath),
        function(dirNames, next) {
            dirNames.forEach(function(dirName) {
                var basePath = path.join(localTmplPath, dirName);
                for (key in VER_FILES) {
                    var verFile = path.join(basePath, VER_FILES[key]);
                    if (fs.existsSync(verFile)) {
                        try {
                            var version = _getEnyoVersion(verFile);
                            log.silly("Found:", verFile, ", version:", version);
                            transMaps.push({
                                from: basePath.replace(/\\/g,'/') + '/',
                                to: path.join(cliDataPath, "templates", version).replace(/\\/g,'/') + '/',
                                version: version
                            })
                            break;
                        } catch (err) {
                            //ignore exception
                            console.error("err:", err);
                        }
                    }
                }
            });
            next();
        }
    ], function(err) {
        setImmediate(next, err, transMaps);
    });
}

function _copyTempl (force, transMaps, next) {
    async.forEachSeries(transMaps, function(map, next) {
    	var subPath = path.relative(cliData.getPath(), map.to);
    	if (force && fs.existsSync(map.to)) {
    		cliData.remove(subPath);
    	}
        if (!fs.existsSync(map.to)) {
            console.log("Initializing template directories. (" + path.basename(map.from) + ")");
            console.log("Please wait for a while...");
            cliData.put(path.join(map.from, "*"), subPath);
        }
        next();
    }, function(err) {
        setImmediate(next, err, transMaps);
    });
}

function _substParams(next) {
    log.info("_substitution");
    var self = this;
    var substs = [];

    var _isJson =  function(str) {
        try {
            JSON.parse(str);
        } catch(err) {
            return false;
        }
        return true;
    };

    var _insertProperty = function(properties, prop) {
        var values = prop.split('=');
        if (values.length != 2) {
            return;
        }
        properties[values[0]] = values[1];
        log.info("Inserting property " + values[0] + " = " + values[1]);
    };

    var _subsAppInfo = function(next) {
        var substitution = { fileRegexp: 'appinfo.json' };
        var properties = {};
        var _refineJsonString = function(str) {
            //FIXME: this is temporary implementation. need to verify more.
            var refnStr = str;
            var reg = /^['|"](.)*['|"]$/;
            if (reg.test(refnStr)) {
                refnStr = refnStr.substring(1, str.length-1);
            }
            reg = /^{(.)*}$/;
            if (!reg.test(refnStr)) {
                //is not JSON string
                return str;
            }
            if (refnStr.indexOf("\"") === -1) {
                return refnStr.replace(/\s*"/g, "")
                        .replace(/\s*'/g, "")
                        .replace("{", "{\"")
                        .replace("}","\"}")
                        .replace(/\s*,\s*/g, "\",\"")
                        .replace(/\s*:\s*/g, "\":\"");
            } else {
                return refnStr.replace(/\s*'/g, "\"");
            }
        }
        options.appInfoProps.forEach(function(prop) {
            var refProp = _refineJsonString(prop);
            if (_isJson(refProp)) {
                properties = JSON.parse(refProp);
            } else {
                _insertProperty(properties, prop);
            }
        });
        substitution.json = properties;
        substitution.add = {};
        for (key in properties) {
            substitution.add[key] = true;
        }
        substs.push(substitution);
        setImmediate(next);
    };
    var _subsFiles = function(next) {
        var savDefBpVer;
        if (fs.existsSync(DEF_BP_FILE)) {
            savDefBpVer = fs.readFileSync(DEF_BP_FILE, 'utf8');
        }
        var wordMaps = {
            "@ENYO-VERSION@": options.bpVer || savDefBpVer || DEF_BP_VER,
            "@SERVICE-NAME@": (options.svcName || DEF_SVC_NAME)
        };
        var substitution = { fileRegexp: '[.]?' };
        substitution.regexp = wordMaps;
        substs.push(substitution);
        setImmediate(next);
    };

    async.series([
        _subsAppInfo.bind(self),
        _subsFiles.bind(self)
    ], function(err) {
        setImmediate(next, null, substs);
    });
}

function _checkOptions(next) {
    var self = this;
    var reqInfos = { tmplCnt: 0, svcCnt: 0, etcCnt: 0,
                     tmplNames: [], svcNames: [], etcNames: [] };
    var dstPath = (options.dstPath)? path.resolve(options.dstPath) : "";
    var _chkTmplName = function(next) {
        if (options.tmplNames.length === 0) {
            for(tmplName in self.tmplInfos) {
                if (self.tmplInfos[tmplName].isDefault) {
                    options.tmplNames.push(tmplName);
                    break;
                }
            }
        }
        if (options.tmplNames) {
            options.tmplNames.forEach(function(tmplName) {
                if (!self.tmplInfos.hasOwnProperty(tmplName)) {
                    return next(new Error("Please check the template name"));
                }
                if (self.tmplInfos[tmplName].type.match(/template/i)) {
                    reqInfos.tmplCnt++;
                    reqInfos.tmplNames.push(tmplName);
                } else if (self.tmplInfos[tmplName].type.match(/Service/i)) {
                    reqInfos.svcCnt++;
                    reqInfos.svcNames.push(tmplName);
                } else {
                    reqInfos.etcCnt++;
                    reqInfos.etcNames.push(tmplName);
                }
            });
        }
        setImmediate(next);
    };
    var _chkDst = function(next) {
        if (!(/^[a-zA-Z0-9\.\_\-]*$/.test(path.basename(dstPath)))){
            return next(new Error("Not available AppDir name"));
        }
        setImmediate(next);
    };
    var _chkSvc = function(next) {
        var needRplc = false;
        if (reqInfos.svcCnt > 0) {
            if ( reqInfos.tmplCnt > 0 || fs.existsSync(path.join(dstPath, 'appinfo.json')) ) {
                needRplc = true;
            }
        }
        var _rplcSvcDstPath = function(next) {
            if (needRplc) {
                async.forEachSeries(self.tmplConf.sources, function(source, next) {
                    if (reqInfos.svcNames.indexOf(source.id) !== -1) {
                        source.files[0].prefixToAdd = "services/" + source.id;
                    }
                    next();
                }, function(err) {
                    setImmediate(next, err);
                });
            } else {
                setImmediate(next);
            }
        }
        async.series([
            _rplcSvcDstPath.bind(self)
        ], function(err) {
            setImmediate(next, err);
        })
    };
    var _chkDefBpVer = function(next) {
        if (!fs.existsSync(DEF_BP_FILE)) {
            fs.writeFileSync(DEF_BP_FILE, DEF_BP_VER, 'utf8');
        }
        setImmediate(next);
    };
    var _chkBpVer = function(next) {
        var avblBpVers = [];
        for (tmplName in self.tmplInfos) {
            if (self.tmplInfos[tmplName].type === 'bootplate' &&
                    self.tmplInfos[tmplName].onDevice === true ) {
                var ver = self.tmplInfos[tmplName].version;
                var dotCnt = (ver.match(/\./g) || []).length;
                if (dotCnt > 1) {
                    var verTokens = ver.split(".");
                    ver = verTokens[0] + '.' + verTokens[1];
                }
                if ((ver.match(/\-/g) || []).length > 0) {
                    ver = ver.split("-")[0];
                }
                avblBpVers.push(ver);
            }
        }
        if (options.bpVer) {
            if ( (options.bpVer.match(/\./g) || []).length < 1 ) {
                return next(new Error("'--onDevice' convention should be like 'MAJAR.MINOR'. (eg) " + DEF_BP_VER));
            }
            if (avblBpVers.indexOf(options.bpVer) === -1) {
                return next(new Error("'--onDevice' value should be one of [" + avblBpVers.join(", ") + "]"));
            }
        }
        setImmediate(next);
    };

    async.series([
        _chkTmplName.bind(self),
        _chkDst.bind(self),
        _chkSvc.bind(self),
        _chkDefBpVer.bind(self),
        _chkBpVer.bind(self)
    ], function(err) {
        setImmediate(next, err);
    });
}

function _savDefVer(next) {
    var self = this;
    var _savBaseBpVer = function(next) {
        var defBpVer = (options.defBpVer == 'true')? DEF_BP_VER : options.defBpVer;
        var avblBpVers = [];
        for (tmplName in self.tmplInfos) {
            if (self.tmplInfos[tmplName].type === 'bootplate' &&
                    self.tmplInfos[tmplName].onDevice === true ) {
                var ver = self.tmplInfos[tmplName].version;
                var dotCnt = (ver.match(/\./g) || []).length;
                if (dotCnt > 1) {
                    var verTokens = ver.split(".");
                    ver = verTokens[0] + '.' + verTokens[1];
                }
                if ((ver.match(/\-/g) || []).length > 0) {
                    ver = ver.split("-")[0];
                }
                avblBpVers.push(ver);
            }
        }
        if (avblBpVers.indexOf(defBpVer) === -1) {
            return next(new Error("'--default-enyo' value should be one of [" + avblBpVers.join(", ") + "]"));
        }
        console.log("Setting default enyo framework version (" + defBpVer + ") for enyo based templates...");
        fs.writeFileSync(DEF_BP_FILE, defBpVer, 'utf8');
        setImmediate(next);
    };

    async.series([
        _savBaseBpVer.bind(self)
    ], function(err) {
        setImmediate(next, err);
    });
}
function _rmDefVer(next) {
    if (fs.existsSync(DEF_BP_FILE)) {
        fs.unlink(DEF_BP_FILE, next);
    } else {
        setImmediate(next);
    }
}
