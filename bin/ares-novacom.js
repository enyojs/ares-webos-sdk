#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    sprintf = require('sprintf').sprintf,
    versionTool = require('./../lib/version-tools'),
    console = require('./../lib/consoleSync'),
    novacom = require('./../lib/novacom');

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
	"getkey":   Boolean, 
	"device":	[String, null],
	"add":		[String, null],
	"remove":	[String, null],
	"modify":	[String, null],
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
	"k": ["--getkey"],
	"d": ["--device"],
	"a": ["--add"],
	"r": ["--remove"],
	"m": ["--modify"]
};

var helpString = [
	"",
	"USAGE:",
	"\t" + processName + " [OPTIONS] --list",
	"\t" + processName + " [OPTIONS] --getkey",
	"\t" + processName + " [OPTIONS] --put file://DEVICE_PATH < HOST_FILE",
	"\t" + processName + " [OPTIONS] --get file://DEVICE_PATH > HOST_FILE",
	"\t" + processName + " [OPTIONS] --run DEVICE_COMMAND",
	"\t" + processName + " [OPTIONS] --add, -a The name key must contain the means.If there is no name error.Properties can be specified JSON objects of the form '{\"name\":\"value1\",\"key2\":\"value2\"...}'.",
	"\t" + processName + " [OPTIONS] --remove, -r Can be removed only in name value or JSON object. ex) remove|-r value or '{\"name\":\"value\"}'.",
	"\t" + processName + " [OPTIONS] --modify, -m Can be modify only in JSON object ex) modify|-m '{\"name\":\"value1\",\"key2\":\"modfy value\"}'.",	
	"\t" + processName + " [OPTIONS] --forward, -f [--port, -p DEVICE_PORT1[:HOST_PORT1]][--port, -p DEVICE_PORT2[:HOST_PORT2]][...]",
	"\t" + processName + " [OPTIONS] --version|-V",
	"\t" + processName + " [OPTIONS] --help|-h",
	"",
	"OPTIONS:",
	"\t--device, -d: device name to connect",
	"\t--level: tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]",
	""
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/
var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	process.exit(1);
});

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
} else if (argv.add) {
	op = add;
} else if (argv.remove) {
	op = remove;
} else if (argv.modify) {
	op = modify;
} else if (argv.forward) {
	op = forward;
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
				devices.forEach(function(device) {
					console.log(sprintf("%-16s %-16s %-24s (%s)", device.name, device.type, device.description, device.addr));
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
	description: "new device description"
};

function _replaceDeviceInfo(inDevice) {
	return inDevice.replace(/["]/g, "")
				.replace(/[']/g, "")
				.replace(/ /g, "")
				.replace("{", "{\"")
				.replace("}","\"}")
				.replace(/,/g, "\",\"")
				.replace(/:/g,"\":\"");	
}

function add(next) {
	try {
		var deviceInfoContent = _replaceDeviceInfo(argv.add);
		var inDevice = JSON.parse(deviceInfoContent);
		var keys = Object.keys(defaultDeviceInfo);
		keys.forEach(function(key) {
			if (!inDevice[key]) {
				inDevice[key] = defaultDeviceInfo[key];
			}
		}.bind(this));
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
		var deviceInfoContent = _replaceDeviceInfo(argv.remove);
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
		var deviceInfoContent = _replaceDeviceInfo(argv.modify);
		var inDevice = JSON.parse(deviceInfoContent);
		var resolver = new novacom.Resolver();
		async.series([
			resolver.load.bind(resolver),
			resolver.modifyDeviceFile.bind(resolver, 'modify', inDevice)
		], next);
	} catch (err) {
		next(err);
	}
}

function getkey(next) {
	var resolver = new novacom.Resolver();
	async.waterfall([
		resolver.load.bind(resolver),
		resolver.getSshPrvKey.bind(resolver, options),
		function(keyFileName, next) {
			if (keyFileName) {
				options.privateKey = { "openSsh": keyFileName };
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
				process.stdout.write('input passphrase [default: webos]:');
				process.stdin.on('data', function (text) {
					var passphrase = text.toString().trim();
					if (passphrase === '') {
						passphrase = 'webos';
					}
					log.info('registed passphrase is ', passphrase);
					options.passphrase = passphrase;
					next(null, options);
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
	if (!argv.port || argv.port == 'true') {
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
