/*
 * 
 */

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    log = require('npmlog'),
    ssh2 = require('ssh2');

(function () {

	var novacom = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = novacom;
	}

	log.heading = 'novacom';
	log.level = 'warn';
	novacom.log = log;

	var keydir = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ssh');

	function makeExecError(cmd, code, signal) {
		var err;
		if (code !== 0 || signal) {
			err = new Error("Command '" + cmd + "' exited with code=" + code + " (signal: " + signal + ")");
			err.code = code;
			err.signal = signal;
		}
		return err;
	}

	/**
	 * @constructor
	 */
	function Resolver() {
		/**
		 * @property devices
		 * This list use to be maintained by novacomd
		 */
		this.devices = [
			{
				name: "default", //"webos305-tcp",
				description: "webOS emulator, with port redirection",
				host: '127.0.0.1',
				port: 5522,
				username: 'root',
				privateKey: fs.readFileSync(path.join(keydir, 'webos')),
				debug: null //console.log //log.verbose.bind(null, 'ssh')
			},
			{
				name: "webospro-tcp",
				description: "webOS Pro emulator, with port redirection",
				host: '127.0.0.1',
				port: 6622,
				username: 'root',
				privateKey: fs.readFileSync(path.join(keydir, 'webos')),
				debug: null //console.log //log.verbose.bind(null, 'ssh')
			},
			{
				name: "ubuntu-1204-fxk",
				description: "Ubuntu Linux Guest, running dropbear or openssh on vboxnet0",
				host: '192.168.56.101',
				port: 22,
				username: 'root',
				privateKey: fs.readFileSync(path.join(keydir, 'webos')),
				debug: null //console.log //log.verbose.bind(null, 'ssh')
			}
		];
	}

	novacom.Resolver = Resolver;

	novacom.Resolver.prototype = {
		getDeviceBy: function(key, value) {
			return this.devices.filter(function(device) {
				return device[key] && device[key] === value;
			})[0];
		}
	};

	/**
	 * @constructor
	 * @param {String} target the name of the target device to connect to.  "default"
	 * @param {Function} next common-js callback, invoked when the Session becomes usable or definitively unusable (failed)
	 */
	function Session(target, next) {
		this.resolver = new Resolver();
		this.target = this.resolver.getDeviceBy('name', (target && target.name) || 'default');
		log.verbose('Session():', "using target:", this.target);
		this.begin(next);
	}

	novacom.Session = Session;

	novacom.Session.prototype = {

		/**
		 * Begin a novacom session with the current target
		 * 
		 * This method can be called multiple times.
		 * 
		 * @param {Function} next common-js callback
		 */
		begin: function(next) {
			if (!this.ssh) {
				this.ssh = new ssh2();
				this.ssh.on('connect', function() {
					log.verbose('Session()', "ssh: on connect");
				});
				this.ssh.on('ready', next);
				this.ssh.on('error', next);
				this.ssh.on('end', function() {
					log.verbose('Session()', "ssh: on end");
				});
				this.ssh.on('close', function(had_error) {
					log.verbose('Session()', "ssh: on close");
				});
				this.ssh.connect(this.target);
			}
			return this;
		},

		/**
		 * Suspend the novacom session.  Underlying resources
		 * are released (eg. SSH conenctions are closed).
		 */
		end: function() {
			this.ssh.end();
			this.ssh = null;
			return this;
		},

		/**
		 * Upload a file on the device
		 * @param {String} outPath location on the device
		 * @param {ReadableStream} inStream paused host-side source
		 * @param {Function} next common-js callback
		 */
		put: function(outPath, inStream, next) {
			var cmd = '/bin/cat > ' + outPath;
			log.verbose('Session#_put()', "cmd=" + cmd);
			this.run(cmd, inStream /*stdin*/, null /*stdout*/, process.stderr /*stderr*/, next); 
		},

		/**
		 * Read a file from the device
		 * @param {String} inPath the device file path to be read
		 * @param {WritableStream} outStream host-side destination to copy the file into
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		get: function(inPath, outStream, next) {
			var cmd = '/bin/cat ' + inPath;
			log.verbose('Session#_get()', "cmd=" + cmd);
			this.run(cmd, null /*stdin*/, outStream /*stdout*/, process.stderr /*stderr*/, next); 
		},

		/**
		 * Run a command on the device
		 * @param {String} cmd the device command to run
		 * @param {Stream} stdin the {Stream} to give as the process's stdin
		 * @param {Stream} stdout the {Stream} to give as the process's stdout
		 * @param {Stream} stderr the {Stream} to give as the process's stderr (can be the same value as stdout)
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		run: function(cmd, stdin, stdout, stderr, next) {
			var self = this;
			log.verbose('Session#_run()', "cmd=" + cmd);
			this.ssh.exec(cmd, (function(err, stream) {
				log.verbose('Session#_run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
					return;
				}
				stream.on('data', function(data, extended) {
					log.info('Session#_run()', "on data (" + (extended ? extended : 'stdout') + ")");
					if (stderr && extended === 'stderr') {
						stderr.write(data);
					} else if (stdout) {
						stdout.write(data);
					}
				});
				stream.on('end', function() {
					log.verbose('Session#_run()', 'ssh: EOF');
				});
				stream.on('exit', function(code, signal) {
					log.verbose('Session#_run()', 'ssh: exit code=' + code + ', signal=' + signal);
					self.err = makeExecError(cmd, code, signal);
				});
				stream.on('close', function() {
					log.verbose('Session#_run()', 'ssh: close, arguments=' + util.inspect(arguments));
					next(self.err);
				});
				// now fire the traffic...
				if (stdin) {
					log.verbose('Session#_run()', 'ssh: resuming stdin: %j', stdin);
					stdin.pipe(stream);
					stdin.resume();
				}
			}).bind(this));
		}

	};
}());
