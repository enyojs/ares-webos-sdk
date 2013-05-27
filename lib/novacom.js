/*
 * 
 */

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    stream = require('stream'),
    net = require('net'),
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
		var err = null; 	// null:success, undefined:did-not-run, Error:failure
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
				name: "webospro",
				description: "webOS Pro emulator, with port redirection",
				host: '127.0.0.1',
				port: 6622,
				username: 'root',
				privateKey: fs.readFileSync(path.join(keydir, 'webos')),
				debug: null //console.log //log.verbose.bind(null, 'ssh')
			},
			{
				name: "tv",
				description: "Ubuntu Linux Guest, running dropbear or openssh on vboxnet0",
				host: '64.28.151.252',
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
		if (!next) {
			throw new Error('novacom.Session(): BUG next must be a common-js callback');
		}
		this.resolver = new Resolver();
		var name = (typeof target === 'object' ? target && target.name : target || 'default');
		this.target = this.resolver.getDeviceBy('name', name);
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
