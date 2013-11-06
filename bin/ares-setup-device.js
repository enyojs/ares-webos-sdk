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
	"add":		Boolean,
	"remove":	[String, null],
	"modify":	Boolean,
	// params for device info
	"name":		[String, null],
	"type":		[String, null],
	"description":		[String, null],
	"host":		[String, null],
	"port":		[String, null],
	"username":		[String, null],
	"files":		[String, null]
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"l": ["--list"],
	"a": ["--add"],
	"r": ["--remove"],
	"m": ["--modify"],
	// params for device info
	"n": ["--name"],
	"t": ["--type"],
	"D": ["--description"],
	"H": ["--host"],
	"p": ["--port"],
	"u": ["--username"],
	"f": ["--files"]
};

var helpString = [
	"",
	"USAGE:",
	help.format(processName + " --list, -l", "List TARGET DEVICE"),
	help.format(processName + " --add, -a <TARGET_INFO>", "Add TARGET_DEVICE_INFO"),
	help.format("", "<TARGET_INFO> can be JSON Form."),
	help.format("", " (e.g.) --add '{\"name\": \"tv2\", \"type\":\"starfish\", \"host\":\"127.0.0.1\",\"port\":\"22\"}'"),
	help.format("", "Or <TARGET_INFO> can be specified by the following additional options."),
	help.format("", "--name, -n [string]   device name"),
	help.format("", "--type, -t [string]   platform type can be 'starfish' or 'emulator'"),
	help.format("", "--description, -D [string]   description of target device"),
	help.format("", "--host, -H [string]   ip address"),
	help.format("", "--port, -p [string]   port number"),
	help.format("", "--username, -u [string]   user name can be 'root' or 'prisoner'"),
	help.format("", "--files, -f [string]   file stream type can be 'stream' or 'sftp'"),
	help.format("", "                       if target device support sft-server,"),
	help.format("", "                       sftp is more stable than general stream"),
	help.format("", " (e.g.) --add --name \"tv2\" --type \"starfish\" "),
	help.format(processName + " --remove, -r <TARGET_INFO>", "Remove TARGET_DEVICE_INFO"),
	help.format("", "<TARGET_INFO> can be JSON Form."),
	help.format("", " (e.g.) --remove '{\"name\": \"tv2\"'}"),
	help.format("", "Or <TARGET_INFO> can be only NAME of target device"),
	help.format("", " (e.g.) --remove tv2"),
	help.format(processName + " --modify, -m <TARGET_INFO>", "Modify TARGET_DEVICE_INFO"),
	help.format("", "<TARGET_INFO> can be JSON Form."),
	help.format("", " (e.g.) --modify '{\"name\":\"tv2\",\"type\":\"starfish\",\"host\":\"192.168.0.123\",\"port\":\"22\"}'"),
	help.format("", "Or <TARGET_INFO> can be specified by the additional options. (please refer to '--add' Usage)"),
	help.format(processName + " --help, -h", "Display this help"),
	help.format(processName + " --version, -V", "Display version info"),
	"",
	"OPTIONS:",
	help.format("--level", "tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
	help.format("-v", "tracing level 'verbose'"),
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
			if (inDevice.port == 22) {
				inDevice.username = "root";
			} else if(inDevice.port == 9922) {
				inDevice.username = "prisoner";
			}
		}
	}
}

function convertJsonForm(str) {
	return str.replace(/\s*"/g, "")
			.replace(/\s*'/g, "")
			.replace("{", "{\"")
			.replace("}","\"}")
			.replace(/\s*,\s*/g, "\",\"")
			.replace(/\s*:\s*/g, "\":\"");
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
				target = JSON.stringify(target);
			}
		} else {
			target = argv.argv.remain.join("");
		}
		var deviceInfoContent = convertJsonForm(target);
		var inDevice = JSON.parse(deviceInfoContent);
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
		var deviceInfoContent = convertJsonForm(argv.remove);
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
				var keys = ["name", "type", "host", "port", "username", "description", "files"];
				keys.forEach( function(key) {
					if (argv[key]) {
						target[key] = argv[key];
					}
				});
				target = JSON.stringify(target);
			}
		} else {
			target = argv.argv.remain.join("");
		}
		var deviceInfoContent = convertJsonForm(target);
		var inDevice = JSON.parse(deviceInfoContent);
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
