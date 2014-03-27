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

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

/*
$ novacom -h
version: novacom-22
usage: novacom [-a address] [-p port] [-t] [-l] [-d device] [-c cmd] [-r password] [-w] <command>
novacom [-V]
novacom [-a address] [-p port] -P[ [-f <localport:remoteport,...>] ]
options:
        -a address: ip address of the novacomd server, default is 'localhost'
        -p port: port of the novacomd server's device list port, default is 6968
        -t: go into terminal mode, for interactive use
        -s: pass signals to remote process
        -l: list devices and then exit
        -r: device password (must use with -c option)
        -c: service command [login, add, remove, logout]
                  login:  opens new session
                  add:    adds device token to host
                  remove: remove device token from host
                  logout: closes active session
        -d device: connect to specific device instead of first.
                 might be <nduid>, <connection type>, <device type>
        -w: wait for device to show up before running command
        -V: version information
        -P: Port Forwarding Enabled
        -f: ports to forward
*/

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
	"reset":    Boolean,
	// params for device info
	"name":		[String, null],
	"type":		[String, null],
	"description":		[String, null],
	"host":		[String, null],
	"port":		[String, null],
	"username":		[String, null],
	"files":		[String, null],
	"privatekey": [String, null],
	"passphrase": [String, null],
	"password": [String, null]
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
	"R": ["--reset"],
	// params for device info
	"n": ["--name"],
	"t": ["--type"],
	"D": ["--description"],
	"H": ["--host"],
	"p": ["--port"],
	"u": ["--username"],
	"f": ["--files"],
	"K": ["--privatekey"],
	"P": ["--passphrase"],
	"W": ["--password"]
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Manages target device, such as emulator and webOS Device."),
	"",
	"SYNOPSIS",
	help.format(processName + " [OPTION...] -a, --add <DEVICE_INFO>"),
	help.format(processName + " [OPTION...] -r, --remove <DEVICE_INFO>"),
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
	help.format("To add a new device info, use '--add'"),
	help.format("<DEVICE_INFO> can be JSON Form."),
	help.format("  (e.g.) --add '{\"name\": \"tv2\", \"type\":\"starfish\", \"host\":\"127.0.0.1\",\"port\":\"22\"}'"),
	help.format("Or <DEVICE_INFO> can be specified by the following additional options."),
	help.format("  --name, -n [string]   device name"),
	help.format("  --type, -t [string]   platform type can be 'starfish' or 'emulator'"),
	help.format("  --description, -D [string]   description of target device"),
	help.format("  --host, -H [string]   ip address"),
	help.format("  --port, -p [string]   port number"),
	help.format("  --username, -u [string]   user name can be 'root' or 'prisoner'"),
	help.format("  --files, -f [string]   file stream type can be 'stream' or 'sftp'"),
	help.format("                         if target device support sftp-server,"),
	help.format("                         sftp is more stable than general stream"),
	help.format("  --privatekey, -K [string]   ssh private key file name."),
	help.format("                              ssh private key should exist under $HOME/.ssh/"),
	help.format("  --passphrase, -P [string]   passphrase used for generating ssh keys"),
	help.format("  --password,   -W [string]   password for ssh connection"),
	help.format("                              '--password' option is available,"),
	help.format("                              only when device allows password authentication via ssh."),
	help.format(" (e.g.) --add --name \"tv2\" --type \"starfish\" "),
	"",
	help.format("To remove DEVICE, use '--remove'"),
	help.format("<DEVICE_INFO> can be JSON Form."),
	help.format("  (e.g.) --remove '{\"name\": \"tv2\"'}"),
	help.format("Or <DEVICE_INFO> can be only NAME of target device"),
	help.format("  (e.g.) --remove tv2"),
	"",
	help.format("To modify DEVICE_INFO, use '--modify'"),
	help.format("<DEVICE_INFO> can be JSON Form."),
	help.format("  (e.g.) --modify '{\"name\":\"tv2\",\"type\":\"starfish\",\"host\":\"192.168.0.123\",\"port\":\"22\"}'"),
	help.format("Or <DEVICE_INFO> can be specified by the additional options like '--add'."),
	help.format("  --name, -n [string]   device name"),
	help.format("  --type, -t [string]   platform type can be 'starfish' or 'emulator'"),
	help.format("  --description, -D [string]   description of target device"),
	help.format("  --host, -H [string]   ip address"),
	help.format("  --port, -p [string]   port number"),
	help.format("  --username, -u [string]   user name can be 'root' or 'prisoner'"),
	help.format("  --files, -f [string]   file stream type can be 'stream' or 'sftp'"),
	help.format("                         if target device support sftp-server,"),
	help.format("                         sftp is more stable than general stream"),
	help.format("  --privatekey, -K [string]   ssh private key file name."),
	help.format("                              ssh private key should exist under $HOME/.ssh/"),
	help.format("  --passphrase, -P [string]   passphrase used for generating ssh keys"),
	help.format("  --password,   -W [string]   password for ssh connection"),
	help.format("                              '--password' option is available,"),
	help.format(" (e.g.) --modify --name \"tv2\" --host \"192.168.0.123\" "),
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
	process.exit(1);
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
		list(next)
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
		resolver.listFull.bind(resolver),
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
	port: 22,
	username: "root",
	description: "new device description",
	files: "stream"
};

function replaceDefaultDeviceInfo(inDevice) {
	if (inDevice) {
		if (inDevice.type && inDevice.type == "emulator") {
			inDevice.type = defaultDeviceInfo.type;
			inDevice.host = "127.0.0.1";
			inDevice.port = 6622;
			inDevice.username = "root";
			inDevice.privateKey = { "openSsh": "webos_emul" };
			inDevice.files = "sftp";
		} else if (inDevice.type && inDevice.type == "starfish") {
			if (inDevice.port == 22 || inDevice.username == "root") {
				inDevice.username = "root";
				inDevice.port = 22;
			} else if(inDevice.port == 9922 || inDevice.username == "prisoner") {
				inDevice.username = "prisoner";
				inDevice.port = 9922;
			}
		}
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

function add(next) {
	try {
		var target = {};
		if (!argv.argv.remain[0]) {
			if (!argv.name) {
				next(new Error("Need a target device name to add."));
				return;
			} else {
				target = {
					"name": argv.name || defaultDeviceInfo.name,
					"type": argv.type || defaultDeviceInfo.type,
					"host": argv.host || defaultDeviceInfo.host,
					"port": argv.port || defaultDeviceInfo.port,
					"username": argv.username || defaultDeviceInfo.username,
					"description": argv.description || defaultDeviceInfo.description,
					"files": argv.files || defaultDeviceInfo.files
				};
				if (argv.passphrase || argv.passphrase === "") {
					target.passphrase = argv.passphrase;
				}
				if (argv.password || argv.password === "") {
					target.password = argv.password;
				}
				target = JSON.stringify(target);
			}
		} else {
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
		var keys = Object.keys(defaultDeviceInfo);
		keys.forEach(function(key) {
			if (!inDevice[key]) {
				inDevice[key] = defaultDeviceInfo[key];
			}
		}.bind(this));
		replaceDefaultDeviceInfo(inDevice);
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'add', inDevice)
		], next);
	} catch (err) {
		next(err);
	}
}

function remove(next) {
	try {
		var deviceInfoContent = refineJsonString(argv.remove);
		var resolver = new novacom.Resolver();
		var argvCheck = deviceInfoContent.indexOf("{");	
		var inDevice;	
		
		if (argvCheck === 0) {
			 inDevice = JSON.parse(deviceInfoContent);
		}else {
			inDevice = {name: deviceInfoContent};
		}
		
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'remove', inDevice)
		], next);
	} catch (err) {
		next(err);
	}
}

function modify(next) {
	try {
		var target = {};
		if (!argv.argv.remain[0]) {
			if (!argv.name) {
				next(new Error("Need a target device name to add."));
				return;
			} else {
				var keys = ["name", "type", "host", "port", "username", "description", "files", "passphrase", "password"];
				keys.forEach( function(key) {
					if (argv[key] || argv[key] === "") {
						target[key] = argv[key];
					}
				});
				target = JSON.stringify(target);
			}
		} else {
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
		replaceDefaultDeviceInfo(inDevice);
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'modify', inDevice)
		], next);
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
