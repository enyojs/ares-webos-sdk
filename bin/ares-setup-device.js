#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    sprintf = require('sprintf').sprintf,
    versionTool = require('./../lib/version-tools'),
    console = require('./../lib/consoleSync'),
    novacom = require('./../lib/novacom'),
    help 	= require('./../lib/helpFormat');

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	process.exit(1);
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
	"add":		Boolean,
	"remove":	[String, null],
	"modify":	Boolean,
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
	help.format(processName + " [OPTION...] -a, --add <DEVICE_INFO>"),
	help.format(processName + " [OPTION...] -r, --remove DEVICE_NAME"),
	help.format(processName + " [OPTION...] -m, --modify <DEVICE_INFO>"),
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
	help.format("To add a new device info, use '--add <DEVICE_INFO>'"),
	help.format(" (e.g.) --add '{\"name\": \"tv2\", \"username\":\"root\", \"host\":\"127.0.0.1\",\"port\":\"22\"}'"),
	help.format("  ** attributes of JSON form."),
	help.format("   name [string]  device name"),
	help.format("   type ['starfish']   platform type"),
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
	"",
	help.format("To remove DEVICE, use '--remove'"),
	help.format(" (e.g.) --remove tv2"),
	"",
	help.format("To modify DEVICE_INFO, use '--modify'"),
	help.format("<DEVICE_INFO> can be JSON Form."),
	help.format("  (e.g.) --modify '{\"name\":\"tv2\",\"username\":\"root\",\"host\":\"192.168.0.123\",\"port\":\"22\"}'"),
	""
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

var log = npmlog;
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
} else if (argv.add) {
	op = add;
} else if (argv.remove) {
	op = remove;
} else if (argv.modify) {
	op = modify;
} else if (argv.version) {
	versionTool.showVersionAndExit();
} else if (argv.help) {
	helpString.forEach(function(line) {
		console.log(line);
	});
	process.exit(0);
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
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.list.bind(resolver),
		function(devices, next) {
			log.info("list()", "devices:", devices);
			if (Array.isArray(devices)) {
				console.log(sprintf("%-16s %-16s %-16s %-24s %s", "<DEVICE NAME>", "<PLATFORM>", "<FILE STREAM>", "<DESCRIPTION>", "<SSH ADDRESS>"));
				devices.forEach(function(device) {
					console.log(sprintf("%-16s %-16s %-16s %-24s (%s)", device.name, device.type, device.files, device.description, device.addr));
				});
			}
			log.info("list()", "Success");
			next();
		}
	], next);
}


function listFull(next) {
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.getRawDeviceString.bind(resolver),
		function(deviceContentsString, next) {
			log.info("listFull()");
			console.log(deviceContentsString);
			log.info("listFull()", "Success");
			next();
		}
	], next);
}

var defaultDeviceInfo = {
	type: "starfish",
	host: "127.0.0.1",
	port: "22",
	username: "root",
	description: "new device description",
	files: "stream",
	indelible: false
};

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

var requiredKeys = {
	"name" : false,
	"type" : false,
	"host" : true,
	"port" : true,
	"username": true,
	"description": true,
	"files" : false,
	"privateKeyName" : true,
	"passphrase": true,
	"password": true
};

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
				var defaultValue = (typeof defaultDeviceInfo[key] === 'string')? "(default: " + defaultDeviceInfo[key] + ")" : "";
				var currentValue = (device[key])? "(" + device[key] + ")" : defaultValue;
				async.waterfall([
					getInput.bind(this, key + " " + currentValue),
					function(input, next) {
						inDevice[key] = (typeof input === "string")? input : device[key];
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
					if (inDevice["privateKeyName"] && typeof inDevice["password"] === 'string') {
						if (inDevice["password"].length === 0) {
							auth = 'key';
							return next();
						}
						async.waterfall([
							getInput.bind(this, "Select SSH auth method [ssh Key(k) or password(p)]"),
							function(input, next) {
								if (input.match(/pass|P/gi)){
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
						inDevice["privateKeyName"] = "@DELETE@";
					}
					next();
				}
			], function(err) {
				if (err) {
					return next(err);
				}
				replaceDefaultDeviceInfo(inDevice);
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

function add(next) {
	try {
		var target = {};
		if (argv.argv.remain[0]) {
			target = argv.argv.remain.join("");
		}
		var deviceInfoContent = refineJsonString(target);
		var inDevice = JSON.parse(deviceInfoContent);
		if (inDevice.privatekey || inDevice.privatekey == "") {
			inDevice.privateKey = inDevice.privatekey;
			delete inDevice.privatekey;
		}
		if ( (inDevice.privateKey || inDevice.privateKey === "") && 
				typeof inDevice.privateKey !== 'object' && typeof inDevice.privateKey === 'string') {
			inDevice.privateKey = { "openSsh": inDevice.privateKey };
		} else if (argv.privatekey || argv.privatekey === "") {
			inDevice.privateKey = { "openSsh": argv.privatekey };
		}
		replaceDefaultDeviceInfo(inDevice);
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'add', inDevice),
			list.bind(this)
		], function(err) {
			if (err) {
				return next(err);
			} 
			next(null, {"msg": "Success to add a device named " + inDevice.name + "!!"});
		});
	} catch (err) {
		next(err);
	}
}

function remove(next) {
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

function modify(next) {
	try {
		var target = {};
		if (argv.argv.remain[0]) {
			target = argv.argv.remain.join("");
		}
		var deviceInfoContent = refineJsonString(target);
		var inDevice = JSON.parse(deviceInfoContent);
		if (inDevice.privatekey || inDevice.privatekey === "") {
			inDevice.privateKey = inDevice.privatekey;
			delete inDevice.privatekey;
		}
		if ( (inDevice.privateKey || inDevice.privateKey === "") &&
				typeof inDevice.privateKey !== 'object' && typeof inDevice.privateKey === 'string') {
			inDevice.privateKey = { "openSsh": inDevice.privateKey };
		} else if (argv.privatekey || argv.privatekey === "") {
			inDevice.privateKey = { "openSsh": argv.privatekey };
		}
		if (inDevice.privatekey) {
			inDevice.password = "@DELETE@";
		} 
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'modify', inDevice),
			list.bind(this)
		], function(err) {
			if (err) {
				return next(err);
			} 
			next(null, {"msg": "Success to modify a device named " + inDevice.name + "!!"});
		});
	} catch (err) {
		next(err);
	}
}

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		console.log(processName + ": "+ err.toString());
		process.exit(1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		process.exit(0);
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
