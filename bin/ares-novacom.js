#!/usr/bin/env node

var fs  	= require('fs'),
    path 	= require("path"),
    npmlog 	= require('npmlog'),
    nopt 	= require('nopt'),
    async 	= require('async'),
    sprintf = require('sprintf').sprintf,
    versionTool = require('./../lib/version-tools'),
    console 	= require('./../lib/consoleSync'),
    novacom 	= require('./../lib/novacom'),
    help 		= require('./../lib/helpFormat');
    
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
	"forward":  Boolean, 
	"port":		[String, Array],
	"privatekey": [String, null],
	"passphrase": [String, null],
	"password": [String, null],
	"getkey":   Boolean, 
	"device":	[String, null],
	// no shortHands
	"run":		[String, null],
	"put":	[String, null],
	"get":	[String, null]
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"l": ["--list"],
	"f": ["--forward"],
	"p": ["--port"],
	"K": ["--privatekey"],
	"P": ["--passphrase"],
	"W": ["--password"],
	"k": ["--getkey"],
	"d": ["--device"]
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Command Line Tool to control target device"),
	"",
	"SYNOPSIS",
	help.format(processName + " [COMMAND]"),
	help.format(processName + " [OPTIONS] --getkey, -k"),
	help.format(processName + " [OPTIONS] --privatekey, -K <PRIVATE_KEY_NAME> --passphrase, -P <PASSPHASE> --device, -d <DEVICE_NAME>"),
	help.format(processName + " [OPTIONS] --run, -r DEVICE_COMMAND"),
	help.format(processName + " [OPTIONS] --forward, -f [--port, -p DEVICE_PORT1[:HOST_PORT1]][--port, -p DEVICE_PORT2[:HOST_PORT2]][...]"),
//  Hidden option '--password'
//	help.format(processName + " [OPTIONS] --password, -W <PASSWORD> --device, -d <DEVICE_NAME>"),
//	"Options (Not implmeneted) :",
//	help.format(processName + " [OPTIONS] --put file://DEVICE_PATH < HOST_FILE"),
//	help.format(processName + " [OPTIONS] --get file://DEVICE_PATH > HOST_FILE"),
//	"",
	"",
	"DESCRIPTION",
	help.format("To get ssh private key from a <DEVELOPER MODE APP>"),
	help.format("running on target device, user can use '--getkey'."),
	"",
	help.format("(Note) If user can set-up a ssh registration manually without"),
	help.format("<DEVELOPER MODE APP>, please update a ssh private key file name"),
	help.format("and passphrase for TARGET DEVICE (e.g.) "+ processName),
	help.format("--privatekey id_rsa --passphrase webos --device TARGET"),
	"",
	help.format("To run a command on target device, use '--run'"),
	"",
	help.format("To run a port forwarding between a Host PC and the target,"),
	help.format("'--forward' is available."),
//  "",
//  Hidden option '--password'
//	help.format("To Set password for a target device named <DEVICE_NAME>,"),
//	help.format("'--password' is available"),
	"",
	help.format("'--getkey' option is available only when TARGET DEVICE runs Secure Developer Mode App."),
	help.format("(e.g.) '--run' option "),
	"",
	help.format(processName + " --run \"ls -al\" --devive TARGET_DEVICE"),
	help.format("(e.g.) '--forward' option"),
	"",
	help.format("'--device' is used for setting device name to connect"),
	"",
	help.format(processName + " --forward --port 22:3030 --device TARGET"),
	help.format("After running the port forwarding between TARGET_DEVICE(22) and HOST_PC(3030),"),
	help.format("User can connect to TARGET_DEVICE via 3030 port"),
	help.format("(Linux/Mac) $ ssh -p 3030 root@127.0.0.1"),
	"",
	help.format("OPTIONS can be used overlapped, but COMMAND is used isolated."),
	"",
	"OPTIONS",
	help.format("--level"),
	help.format("\t tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]"),
	"",
	help.format("-v"),
	help.format("\t tracing level 'verbose'"),
	"",
	"COMMAND",
	help.format("--help, -h"),
	help.format("\t Display this help"),
	"",
	help.format("--version, -V"),
	help.format("\t Display version info"),
	"",
	help.format("--list, -l"),
	help.format("\t List TARGET DEVICE"),
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
} else if (argv.getkey) {
	op = getkey;
} else if (argv.put) {
	op = put;
} else if (argv.get) {
	op = get;
} else if (argv.run) {
	op = run;
} else if (argv.forward) {
	op = forward;
} else if (argv.privatekey || argv.passphrase || argv.password) {
	op = setSshAuthInfo;
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
				console.log(sprintf("%-16s %-16s %-16s %-16s %s", 
						"<DEVICE NAME>", "<PLATFORM>", "<PRIVATE KEY>", "<PASSPHRASE>", "<SSH ADDRESS>"));
				devices.forEach(function(device) {
					var sshPrvKeyName = device.privateKeyName || "'No Ssh Key'";
					var sshPassphrase = device.passphrase || "'No passphrase'"
					console.log(sprintf("%-16s %-16s %-16s %-16s (%s)", 
						device.name, device.type, sshPrvKeyName, sshPassphrase, device.addr));
				});
			}
			log.info("list()", "Success");
			next();
		}
	], next);
}

function getkey(next) {
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.getSshPrvKey.bind(resolver, options),
		function(keyFileName, next) {
			if (keyFileName) {
				var target = {};
				target.name = options.name;
				target.privateKey = { "openSsh": keyFileName };
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
				process.stdout.write('input passphrase [default: webos]:');
				process.stdin.on('data', function (text) {
					var passphrase = text.toString().trim();
					if (passphrase === '') {
						passphrase = 'webos';
					}
					log.info('registed passphrase is ', passphrase);
					target.passphrase = passphrase;
					next(null, target);
				});
			} else {
				next(null, null);
			}
		},
		resolver.modifyDeviceFile.bind(resolver, 'modify')
	], next);
}

function put(next) {
	next(new Error("Not yet implemented"));
}

function get(next) {
	next(new Error("Not yet implemented"));
}

function run(next) {
	var session = new novacom.Session(options, function(err, result) {
		log.verbose("run()", "argv:", argv.run);
		log.verbose("run()", "options:", options);
		if (err) {
			next(err);
			return;
		}
		session.run(argv.run, process.stdin, process.stdout, process.stderr, next);
	});
}

function forward(next) {
	log.info('forward', "ports:", argv.port);
	if (!argv.port || argv.port.toString() === 'true') {
		next(new Error("forward option needs port value to forward via '--port, -p DEVICE_PORT:HOST_PORT'"));
		return;
	}

	var tasks = [
		function(next) {
			options.session = new novacom.Session(options, next);
		}
	];
	try {
		argv.port.forEach(function(portStr) {
			var portArr = portStr.split(':'),
			    devicePort, localPort, deviceAddr;
			devicePort = parseInt(portArr[0], 10);
			localPort = parseInt(portArr[1], 10) || devicePort;
			tasks.push(function(next) {
				options.session.forward(devicePort, localPort, next);
			});
			tasks.push(function(next) {
				log.info('forward','running...');
			});
		});
	} catch(err) {
		next(err);
		return;
	}
	async.series(tasks, next);
}

function setSshAuthInfo(next) {
	console.log('setSshAuthInfo', "privateKey:", argv.privatekey, ", passphrase:", argv.passphrase, ", password:", argv.password);
	try {
		var target = {
			"name": argv.device
		};
		if (argv.privatekey) {
			target.privateKey = { "openSsh": argv.privatekey };
		}
		if (argv.passphrase || argv.passphrase == "") {
			target.passphrase = argv.passphrase;
		}
		if (argv.password || argv.password == "") {
			target.password = argv.password;
		}
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'modify', target)
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
