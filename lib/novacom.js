/*
 * novacom emulation layer, on top of ssh
 */

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    stream = require('stream'),
    net = require('net'),
    mkdirp = require('mkdirp'),
    async = require('async'),
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

	var keydir = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ssh'),
	    appdir = path.resolve(process.env.APPDATA || process.env.HOME || process.env.USERPROFILE, '.ares');

	function makeExecError(cmd, code, signal) {
		var err = null; 	// null:success, undefined:did-not-run, Error:failure
		if (code !== 0 || signal) {
			err = new Error("Command '" + cmd + "' exited with code=" + code + " (signal: " + signal + ")");
			err.code = code;
			err.signal = signal;
		}
		return err;
	}

	novacom.Resolver = Resolver;

	/**
	 * @constructor
	 */
	function Resolver() {
		/**
		 * @property devices
		 * This list use to be maintained by novacomd
		 */
		this.devices = [];
	}

	novacom.Resolver.prototype = {
		/**
		 * Load the resolver DB from the filesystem
		 * @param {Function} next a common-JS callback invoked when the DB is ready to use.
		 */
		load: function(next) {
			var resolver = this,
			    builtins = path.join(__dirname, 'novacom-devices.json'),
			    others = path.join(appdir, 'novacom-devices.json');
			log.verbose("Resolver#load()");
			async.waterfall([
				_readFile.bind(resolver, builtins, true /*mandatory*/),
				_loadString.bind(resolver),
				_readFile.bind(resolver, others, false /*mandatory*/),
				_loadString.bind(resolver),
				this.save.bind(this)
			], function(err) {
				if (err) {
					next(err);
				} else {
					log.info("Resolver#load()", "devices:", resolver.devices);
					next(null, resolver.devices);
				}
			});

			function _readFile(fileName, mandatory, next) {
				log.verbose("Resolver#load#_readFile()", "<<< " + fileName);
				if (mandatory) {
					fs.readFile(fileName, 'utf8', next);
				} else {
					fs.readFile(fileName, 'utf8', function(err, str) {
						if (err && err.code === 'ENOENT') {
							next(null, "[]");
						} else {
							next(err, str);
						}
					});
				}
			}

			/*
			 * Load devices described in the given string
			 * (supposed to be a JSON Array).
			 */
			function _loadString(str, next) {
				log.silly("Resolver#load#_loadString()", "str:", str);
				var inDevices = JSON.parse(str);
				if (!Array.isArray(inDevices)) {
					next(new Error("Incorrect file format'"));
					return;
				}
				log.silly("Resolver#load#_loadString()", "inDevices:", inDevices);
				async.forEach(inDevices, function(inDevice, next) {
					async.series([
						_loadOne.bind(resolver, inDevice),
						_addOne.bind(resolver, inDevice)
					], next);
				}, function(err, results) {
					if (err) {
						next(err);
					} else {
						log.verbose("Resolver#load#_loadString()", "devices:", resolver.devices);
						next();
					}
				});
			}

			/*
			 * Resolve the SSH private key of the given
			 * device into a usable string
			 */
			function _loadOne(inDevice, next) {
				if (typeof inDevice.privateKey === 'string') {
					inDevice.privateKey = new Buffer(inDevice.privateKey, 'base64');
					next();
				} else if (typeof inDevice.privateKey === 'object' && typeof inDevice.privateKey.openSsh === 'string') {
					async.waterfall([
						fs.readFile.bind(resolver, path.join(keydir, inDevice.privateKey.openSsh)),
						function(privateKey, next) {
							inDevice.privateKey = privateKey;
							next();
						}
					], function(err) {
						// do not load non-existing OpenSSH private key files
						if (err) {
							inDevice.privateKey = undefined;
						}
						next();
					});
				} else {
					next(new Error("unable to handle device name '" + inDevice.name + "' with privateKey:" + util.inspect(inDevice.privateKey)));
				}
			}

			/*
			 * Add given inDevice to the Resolver DB,
			 * overwritting any existing one with the same
			 * "name:" is needed.
			 */
			function _addOne(inDevice, next) {
				log.silly("Resolver#load#_addOne()", "device", inDevice);
				// filter-out `this.devices` from the one having the same name as `inDevice`...
				resolver.devices = resolver.devices.filter(function(device) {
					return device.name !== inDevice.name;
				});
				// ...and then append `inDevice`
				resolver.devices.push(inDevice);
				next();
			}
		},

		save: function(next) {
			var devices = this.devices,
			    others = path.join(appdir, 'novacom-devices.json');
			log.verbose("Resolver#save()", ">>> " + others);
			async.series([
				mkdirp.bind(this, appdir),
				fs.writeFile.bind(this, others, JSON.stringify(devices, _saveOne, 2))
			], next);

			function _saveOne(key, value) {
				if (key === "privateKey") {
					if (typeof value === 'string') {
						return value;
					} else if (value instanceof Buffer) {
						// convert to base64
						return value.toString('base64');
					}
				}
				// recurse JSON.stringify
				return value;
			}
		},

		list: function(next) {
			log.verbose("Resolver#list()");
			next(null, this.devices);
		},

		getDeviceBy: function(key, value, next) {
			log.verbose("Resolver#getDeviceBy()", "key:", key, "value:", value);
			var device = this.devices.filter(function(device) {
				return device[key] && device[key] === value;
			})[0];
			log.verbose("Resolver#getDeviceBy()", "device:", device);
			if (typeof next === 'function') {
				log.silly("Resolver#getDeviceBy()", "async");
				next(null, device);
			} else {
				log.silly("Resolver#getDeviceBy()", "sync");
				return device;
			}
		}
	};

	/**
	 * @constructor
	 * @param {String} target the name of the target device to connect to.  "default"
	 * @param {Function} next common-js callback, invoked when the Session becomes usable or definitively unusable (failed)
	 */
	function Session(target, next) {
		if (typeof next !== 'function') {
			throw new Error('novacom.Session(): BUG next must be a common-js callback');
		}
		var session = this;
		var name = (typeof target === 'string' ? target : target && target.name) || 'default';
		log.info("novacom.Session()", "opening session to '" + name + "'");
		this.resolver = new Resolver();
		async.waterfall([
			this.resolver.load.bind(this.resolver),
			function(devices, next) { next(); },
			this.resolver.getDeviceBy.bind(this.resolver, 'name', name),
			this.begin.bind(this)
		], next);
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
		begin: function(target, next) {
			log.verbose('Session#begin()', "target:", target);
			this.target = target || this.target;
			if (!this.ssh) {
				this.forwardedPorts = [];
				this.ssh = new ssh2();
				this.ssh.on('connect', function() {
					log.verbose('Session#begin()', "ssh session event: connected");
				});
				this.ssh.on('ready', next);

				this.ssh.on('error', next);

				this.ssh.on('end', function() {
					log.verbose('Session#begin()', "ssh session event: end");
				});
				this.ssh.on('close', function(had_error) {
					log.verbose('Session#begin()', "ssh session event: close  (had_error:", had_error, ")");
				});
				this.ssh.connect(this.target);
			}
			return this;
		},

		/**
		 * Suspend the novacom session.  Underlying resources
		 * are released (eg. SSH connections are closed).
		 */
		end: function() {
			log.verbose('Session#end()', "user-requested termination");
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
			log.verbose('Session#put()', "streaming into device:" + outPath);
			var cmd = '/bin/cat > ' + outPath;
			this.run(cmd, inStream /*stdin*/, null /*stdout*/, process.stderr /*stderr*/, next); 
		},

		/**
		 * Read a file from the device
		 * @param {String} inPath the device file path to be read
		 * @param {WritableStream} outStream host-side destination to copy the file into
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		get: function(inPath, outStream, next) {
			log.verbose('Session#get()', "streaming from device:" + inPath);
			var cmd = '/bin/cat ' + inPath;
			this.run(cmd, null /*stdin*/, outStream /*stdout*/, process.stderr /*stderr*/, next); 
		},

		/**
		 * Run a command on the device
		 * @param {String} cmd the device command to run
		 * @param {stream.ReadableStream} stdin given as novacom process stdin
		 * @param {stream.WritableStream} stdout given as novacom process stdout
		 * @param {stream.WritableStream} stderr given as novacom process stderr
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		run: function(cmd, stdin, stdout, stderr, next) {
			var err;
			log.verbose('Session#run()', "cmd=" + cmd);

			// plumb output 
			var write = {}, end = {};
			if (!stdout) {
				write.stdout = end.stdout = function() {};
			} else if (stdout instanceof stream.Stream) {
				write.stdout = stdout.write;
				end.stdout = stdout.end;
			} else if (stdout instanceof Function) {
				write.stdout = stdout;
				end.stdout = function() {};
			} else {
				next(new Error("Invalid novacom stdout: " + util.inspect(stdout)));
			}
			if (!stderr) {
				write.stderr = end.stderr = function() {};
			} else if (stderr instanceof stream.Stream) {
				write.stderr = stderr.write;
				end.stderr = stderr.end;
			} else if (stderr instanceof Function) {
				write.stderr = stderr;
				end.stderr = function() {};
			} else {
				next(new Error("Invalid novacom stderr: " + util.inspect(stderr)));
			}
			
			// execute command
			this.ssh.exec(cmd, (function(err, stream) {
				log.verbose('Session#run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
					return;
				}

				// manual pipe(): handle & divert data chunks
				stream.on('data', function(data, extended) {
					extended = extended || 'stdout';
					log.verbose('Session#run()', "on data (" + extended + ")");
					write[extended](data);
				});
				// manual pipe(): handle EOF
				stream.on('end', function() {
					log.verbose('Session#run()', "event EOF from (cmd: " + cmd + ")");
					end.stdout();
					end.stderr();
				});

				// Exit when the remote process has terminated
				stream.on('exit', function(code, signal) {
					log.verbose('Session#run()', "event exit code=" + code + ', signal=' + signal + " (cmd: " + cmd + ")");
					err = makeExecError(cmd, code, signal);
					next(err);
				});

				// Exit if the 'exit' event was not
				// received (dropbear <= 0.51)
				stream.on('close', function() {
					log.verbose('Session#run()', "event close  (cmd: " + cmd + ")");
					if (err === undefined) {
						next();
					}
				});

				if (stdin) {
					stdin.pipe(stream);
					log.verbose('Session#run()', 'resuming input');
					stdin.resume();
				}
			}).bind(this));
		},

		/**
		 * Forward the given device port on the host
		 * 
		 * As any other public method, this one can be called
		 * only once the ssh session has emitted the 'ready'
		 * event, so as part of the Session#next callback.
		 * 
		 * @public
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		forward: function(devicePort, localPort, next) {
			log.verbose('Session#forward()', "devicePort:", devicePort, "localPort:", localPort);
			var session = this;
			var localServer = net.createServer(function(inCnx) {

				log.info('Session#forward()', "new client, localPort:", localPort);
				log.verbose('Session#forward()', "new client, from: " + inCnx.remoteAddress +':'+ inCnx.remotePort);
				inCnx.pause();
				// Open the outbound connection on the
				// device to match the incoming
				// client.
				session.ssh.forwardOut("127.0.0.1" /*srcAddr*/, inCnx.remotePort /*srcPort*/, '127.0.0.1' /*dstAddr*/, devicePort /*dstPort*/, function(err, outCnx) {
					if (err) {
						log.warn('Session#forward()', "failed forwarding client localPort:", localPort, "=> devicePort:", devicePort);
						inCnx.destroy();
						return;
					}
					log.info('Session#forward()', "connected, devicePort:", devicePort);
					outCnx.pause();
					outCnx.pipe(inCnx);
					inCnx.pipe(outCnx);
					inCnx.resume();
					outCnx.resume();
					outCnx.on('error', function(err) {
						log.verbose('Session#forward()', 'outCnx::error, err:: ' + err);
					});
					outCnx.on('close', function(had_err) {
						log.verbose('Session#forward()', 'outCnx::close, had_err:', had_err);
					});
				});

			});
			try {
				localServer.listen(localPort, "127.0.0.1");
				session.forwardedPorts.push({local:localPort, device: devicePort});
			} catch(err) {
				next(err);
			}
		}
	}
}());
