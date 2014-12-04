var fs = require('fs'),
    path = require("path"),
    log = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    sprintf = require('sprintf-js').sprintf,
	Table = require('easy-table'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    novacom = require('./../lib/novacom'),
    help 	= require('./../lib/helpFormat');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	cliControl.end(-1);
});

var processName = path.basename(process.argv[1]).replace(/.js/, '');

var knownOpts = {
	//generic options
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
	"version":	Boolean,
	// command-specific options
	"list":		Boolean,
	"listfull":		Boolean,
	"add":		[String, null],
	"remove":	[String, null],
	"modify":	[String, null],
	"info":	[String, Array],
	"reset":	Boolean
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"l": ["--list"],
	"F": ["--listfull"],
	"i": ["--info"],
	"a": ["--add"],
	"r": ["--remove"],
	"m": ["--modify"],
	"R": ["--reset"]
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Manages target device, such as emulator and webOS Device."),
	"",
	"SYNOPSIS",
	help.format(processName + " [OPTION...]"),
	help.format(processName + " [OPTION...] -a, --add DEVICE_NAME -i, --info <DEVICE_INFO>"),
	help.format(processName + " [OPTION...] -m, --modify DEVICE_NAME -i, --info <DEVICE_INFO>"),
	help.format(processName + " [OPTION...] -r, --remove DEVICE_NAME"),
	"",
	"OPTION",
	help.format("-R, --reset", "initialize the DEVICE list"),
	help.format("-l, --list", "List the available DEVICEs"),
	help.format("-F, --listfull", "List the available DEVICEs in detail"),
	help.format("--level <LEVEL>", "tracing LEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
	help.format("-h, --help", "Display this help"),
	help.format("-V, --version", "Display version info"),
	"",
	"DESCRIPTION",
	help.format("Basically, this command provide an interactive prompt to get a device information"),
	"",
	help.format("To add a new device info, use '--add DEVICE_NAME -i <DEVICE_INFO>'"),
	help.format("<DEVICE_INFO> can be one of the following forms"),
	help.format("win32",            "\t (e.g.) --add tv2 -i \"{'username':'root', 'host':'127.0.0.1','port':'22'}\""),
	help.format(["linux","darwin"], "\t (e.g.) --add tv2 -i '{\"username\":\"root\", \"host\":\"127.0.0.1\",\"port\":\"22\"}'"),
	help.format("\t (e.g.) --add tv2 -i \"username=root\" -i \"host=127.0.0.1\" -i \"port=22\""),
	"",
	help.format("To remove DEVICE, use '--remove DEVICE_NAME'"),
	help.format("\t (e.g.) --remove tv2"),
	"",
	help.format("To modify DEVICE_INFO, use '--modify DEVICE_NAME -i <DEVICE_INFO>'"),
	help.format("<DEVICE_INFO> can be one of the following forms"),
	help.format("win32",            "\t (e.g.) --modify tv2 -i \"{'username':'developer','host':'192.168.0.123','port':'6622'}\""),
	help.format(["linux","darwin"], "\t (e.g.) --modify tv2 -i '{\"username\":\"developer\",\"host\":\"192.168.0.123\",\"port\":\"6622\"}'"),
	help.format("\t (e.g.) --modify tv2 -i \"username=developer\" -i \"host=192.168.0.123\" -i \"port=6622\""),
	"",
	"",
	help.format("** Attributes of <DEVICE_INFO>"),
	//help.format("   type ['starfish']   platform type"),
	help.format("   description [string]   description of target device"),
	help.format("   host [string]   ip address"),
	help.format("   port [string]   port number"),
	help.format("   username [string]   user name to connect ('developer' or 'prisoner')"),
	help.format("   files ['stream' | 'sftp']   file stream type can be 'stream' or 'sftp'"),
	help.format("                         if target device support sftp-server,"),
	help.format("                         sftp is more stable than general stream"),
	help.format("   privatekey  [string]   ssh private key file name."),
	help.format("                         ssh private key should exist under $HOME/.ssh/"),
	help.format("   passphrase  [string]   passphrase used for generating ssh keys"),
	help.format("   password  [string]   password for ssh connection"),
	""
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/
log.verbose("argv", argv);

var op;
if (argv.list) {
	op = list;
} else if (argv.listfull) {
	op = listFull;
} else if (argv.reset) {
	op = reset;
} else if (argv.add || argv.modify || argv.info) {
	op = modifyDeviceInfo;
} else if (argv.remove) {
	op = removeDeviceInfo;
} else if (argv.version) {
	versionTool.showVersionAndExit();
} else if (argv.help) {
	help.print(helpString);
	cliControl.end();
} else {
	op = interactiveInput;
}

var options = {
	name: argv.device
};

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

var defaultDeviceInfo = {
	type: "starfish",
	host: "127.0.0.1",
	port: 22,
	username: "root",
	description: "new device description",
	files: "stream",
	indelible: false
};

var requiredKeys = {
	"name" : false,
	"type" : false,
	"host" : true,
	"port" : true,
	"username": true,
	"description": true,
	"files" : true,
	"privateKeyName" : true,
	"passphrase": true,
	"password": true
};

/**********************************************************************/
function reset(next) {
	var appdir = path.resolve(process.env.APPDATA || process.env.HOME || process.env.USERPROFILE, '.ares');
	var deviceFilePath = path.join(appdir, 'novacom-devices.json');
	async.series([
		function(next) {
			if (fs.existsSync(deviceFilePath)) {
				fs.unlink(deviceFilePath, next);
			} else {
				next();
			}
		},
		list()
	], function(err) {
		next(err);
	});
}

function list(next) {
	var table = new Table;
	var data = [];
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.list.bind(resolver),
		function(devices, next) {
			log.info("list()", "devices:", devices);
			if (Array.isArray(devices)) {
				devices.forEach(function(device) {
					var info = device.username + '@' + device.host + ':' + device.port;
					data.push( {name: device.name, info:info, connection:'ssh' } );
				});
			}
			data.forEach(function(item){
				table.cell('name', item.name);
				table.cell('deviceinfo', item.info);
				table.cell('connection', item.connection);
				table.newRow();
			});
			console.log(table.toString());
			log.info("list()", "Success");
			next();
		}
	], next);
}


function listFull(next) {
	var outputJson = []
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.list.bind(resolver),
		function(devices, next) {
			log.info("list()", "devices:", devices);
			if (Array.isArray(devices)) {
				devices.forEach(function(device) {
					var item = {
						name : device.name,
						deviceinfo : {
							ip: device.host,
							port: String(device.port),
							user: device.username
						},
						connection: 'ssh',
						details: {
							password: device.password,
							privatekey: device.privateKeyName,
							passphrase: device.passphrase,
							platform: device.type,
							files: device.files,
							description: device.description
						}
					};
					outputJson.push(item);
					var info = device.username + '@' + device.host + ':' + device.port;
				});
			}
			console.log(JSON.stringify(outputJson, null, 4));
			log.info("listFull()", "Success");
			next();
		}
	], next);
}

function replaceDefaultDeviceInfo(inDevice) {
	if (inDevice) {
		inDevice.type = inDevice.type || defaultDeviceInfo.type;
		inDevice.host = inDevice.host || defaultDeviceInfo.host;
		inDevice.port = inDevice.port || defaultDeviceInfo.port;
		inDevice.username = inDevice.username || defaultDeviceInfo.username;
		inDevice.files = inDevice.files || defaultDeviceInfo.files;
		inDevice.description = inDevice.description || defaultDeviceInfo.description;
		inDevice.indelible = inDevice.indelible || defaultDeviceInfo.indelible;
	}
}

function refineJsonString(str) {
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

function getInput(inputMsg, next) {
	var keyInputString = "";
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	process.stdout.write(inputMsg+': ');
	process.stdin.once('data', function (text) {
		var input;
		if (text !== '\n') {
			input = text.toString().trim();
		}
		next(null, input);
	});
}

function getDevice(name, next) {
	if (!name) {
		return next(new Error("Need to input a device name"));
	}
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.getDeviceBy.bind(resolver, 'name', '^'+name+'$')
	], function(err, device){
		if (err) {
			console.log("Adding new device named ", name, "!!");
			next(null, {"name" : name, "mode":"add"});
		} else {
			next(null, device);
		}
	});
}

function interactiveInput(next) {
	var mode = 'modify';
	async.waterfall([
		list.bind(this),
		function(next) {
			console.log("** You can modify the device info in the above list, or add new device.");
			next();
		},
		getInput.bind(this,"Enter Device Name"),
		getDevice.bind(this),
		function(device, next) {
			var inDevice = {};
			if (device.mode) {
				mode = device.mode;
				delete device.mode;
			}
			if (device.name) {
				console.log("Device Name :", device.name);
			}
			var keys = Object.keys(requiredKeys);
			async.forEachSeries(keys, function(key, next){
				if (requiredKeys[key] === false) {
					inDevice[key] = device[key];
					return next();
				}
				var defaultValue = (defaultDeviceInfo[key] !== 'undefined')? "(default: " + defaultDeviceInfo[key] + ")" : "";
				var currentValue = (device[key])? "(" + device[key] + ")" : defaultValue;
				async.waterfall([
					getInput.bind(this, key + " " + currentValue),
					function(input, next) {
						inDevice[key] = (typeof input === "string" && input.length>0)? input : device[key];
						next();
					}
				], function(err) {
					next();
				});
			}, function(err) {
				next(err, inDevice);
			});
		}
	], function(err, inDevice){
		if (err) {
			return 	next(err);
		} else {
			var auth = 'pass'; //key or pass
			async.series([
				function(next) {
					var nullValue = ["\"\"", "''"];
					["privateKeyName", "password", "passphrase"].forEach(function(sshType) {
						if (value = inDevice[sshType]) {
							if (nullValue.indexOf(value) !== -1) {
								delete inDevice[sshType];
							}
						}
					});
					if (inDevice["privateKeyName"] && typeof inDevice["password"] === 'string') {
						if (inDevice["password"].length === 0) {
							auth = 'key';
							return next();
						}
						async.waterfall([
							getInput.bind(this, "Select SSH auth method [ssh Key(k) or password(p)]"),
							function(input, next) {
								if (!input) {
									auth = 'key';
								}
								else if (input.match(/pass|P/gi)){
									auth = 'pass';
								} else {
									auth = 'key';
								}
								next();
							}
						], function(err) {
							next(err);
						});
					} else {
						if (inDevice["privateKeyName"]) {
							auth = 'key';
						} else if ((inDevice["password"])) {
							auth = 'pass';
						}
						next();
					}
				},
				function (next) {
					if (auth === 'pass') {
						inDevice["password"] = inDevice["password"] || "";
						inDevice["privateKey"] = "@DELETE@";
						inDevice["passphrase"] = "@DELETE@";
						inDevice["privateKeyName"] = "@DELETE@";
					} else if (auth === 'key') {
						inDevice["password"] = "@DELETE@";
						inDevice["privateKey"] = { "openSsh": inDevice["privateKeyName"] };
						inDevice["passphrase"] = inDevice["passphrase"] || "@DELETE@";
						inDevice["privateKeyName"] = "@DELETE@";
					}
					next();
				}
			], function(err) {
				if (err) {
					return next(err);
				}
				replaceDefaultDeviceInfo(inDevice);
				if (inDevice.port) {
					inDevice.port = Number(inDevice.port);
				}
				var resolver = new novacom.Resolver();
				async.series([
					resolver.load.bind(resolver),
					resolver.modifyDeviceFile.bind(resolver, mode, inDevice),
					list.bind(this)
				], function(err) {
					if (err) {
						return next(err);
					}
					next(null, {"msg": "Success to " + mode + " a device!!"});
				});
			});
		}
	})
}

function isJson(str) {
	try {
		JSON.parse(str);
	} catch(err) {
		return false;
	}
	return true;
}

function insertParams(params, keyPair) {
	var values = keyPair.split('=');
	if (values.length != 2) {
		return;
	}
	params[values[0]] = values[1];
	log.info("Inserting params " + values[0] + " = " + values[1]);
}

function getParams(option) {
	var params = {};
	if (argv[option]) {
		var arryArgs = [].concat(argv[option]);
		arryArgs.forEach(function(strParam) {
			var jsonFromArgv = strParam;
			jsonFromArgv = refineJsonString(jsonFromArgv);
			if (isJson(jsonFromArgv)) {
				params = JSON.parse(jsonFromArgv);
			} else {
				insertParams(params, strParam);
			}
		});
	}
	return params;
}

function modifyDeviceInfo(next) {
	try {
		var mode = (argv.add)? "add" : (argv.modify)? "modify" : null;
		if (!mode) {
			return next(new Error("Please specify an option among '--add' and '--modify'"));
		}
		if (argv[mode].match(/^-/)) {
			return next(new Error("Please specify device name !!"));
		}
		var argName = (argv.info)? "info" : mode;
		var inDevice = getParams(argName);
		if (!inDevice.name) {
			if (argv[mode] === "true") {
				return next(new Error("Please specify device name !!"));
			}
			inDevice.name = argv[mode];
		}
		if (typeof inDevice.privatekey === "string") {
			inDevice.privateKey = inDevice.privatekey;
			inDevice.privateKey = { "openSsh": inDevice.privateKey };
			delete inDevice.privatekey;
			inDevice.password = "@DELETE@";
		}
		if (typeof inDevice.password !== "undefined"  && inDevice.password !== "@DELETE@") {
			inDevice.privateKey = "@DELETE@";
			inDevice.passphrase = "@DELETE@";
		}
		if (mode === "add") {
			replaceDefaultDeviceInfo(inDevice);
		}
		var resolver = new novacom.Resolver();
		if (inDevice.port) {
			inDevice.port = Number(inDevice.port);
		}
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, mode, inDevice),
			list.bind(this)
		], function(err) {
			if (err) {
				return next(err);
			} 
			next(null, {"msg": "Success to " + mode + " a device named " + inDevice.name + "!!"});
		});
	} catch (err) {
		next(err);
	}
}

function removeDeviceInfo(next) {
	try {
		var deviceInfoContent = refineJsonString(argv.remove);
		var resolver = new novacom.Resolver();
		var inDevice = {name: deviceInfoContent};
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'remove', inDevice),
			list.bind(this)
		], function(err) {
			if (err) {
				return next(err);
			} 
			next(null, {"msg": "Success to remove a device named " + argv.remove + "!!"});
		});
	} catch (err) {
		next(err);
	}
}

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		log.error(processName + ": "+ err.toString());
		log.verbose(err.stack);
		cliControl.end(-1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		cliControl.end();
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
