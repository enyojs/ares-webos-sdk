#!/usr/bin/env node

var fs = require('fs'),
    path = require("path"),
    npmlog = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    sprintf = require('sprintf').sprintf,
    versionTool = require('./../lib/version-tools'),
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
	"device":	[String, null],
	"port":		[String, Array]
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"l": ["list"],
	"P": ["forward"],
	"d": ["--device"],
	"p": ["--port"]
};

var helpString = [
	"",
	"USAGE:",
	"\t" + processName + " [OPTIONS] list",
	"\t" + processName + " [OPTIONS] put file://DEVICE_PATH < HOST_FILE",
	"\t" + processName + " [OPTIONS] get file://DEVICE_PATH > HOST_FILE",
	"\t" + processName + " [OPTIONS] run DEVICE_COMMAND",
	"\t" + processName + " [OPTIONS] [--port DEVICE_PORT1[:HOST_PORT1]][--port DEVICE_PORT2[:HOST_PORT2]][...] forward",
	"\t" + processName + " [OPTIONS] --version|-V",
	"\t" + processName + " [OPTIONS] --help|-h",
	"",
	"OPTIONS:",
	"\t--device|-d: device name to connect to default]",
	"\t--level: tracing level is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error' [warn]",
	""
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

var log = npmlog;
log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	process.exit(1);
});

/**********************************************************************/

log.verbose("argv", argv);

var op, command = argv.argv.remain.shift();
if (command === 'list') {
	op = list;
} else if (command === 'put') {
	op = put;
} else if (command === 'get') {
	op = get;
} else if (command === 'run') {
	op = run;
} else if (command === 'forward') {
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

function put(next) {
	next(new Error("Not yet implemented"));
}

function get(next) {
	next(new Error("Not yet implemented"));
}

function run(next) {
	var session = new novacom.Session(options, function(err, result) {
		log.verbose("run()", "argv:", argv.argv.remain);
		log.verbose("run()", "options:", options);
		if (err) {
			next(err);
			return;
		}
		session.run(argv.argv.remain.join(" "), process.stdin, process.stdout, process.stderr, next);
	});
}

function forward(next) {
	log.info('forward', "ports:", argv.port);
	var tasks = [
		function(next) {
			options.session = new novacom.Session(options.device, next);
		}
	];
	try {
		argv.port.forEach(function(portStr) {
			var portArr = portStr.split(':'),
			    devicePort, localPort;
			devicePort = parseInt(portArr[0], 10);
			localPort = parseInt(portArr[1], 10) || devicePort;
			tasks.push(function(next) {
				options.session.forward(devicePort, localPort, next);
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
