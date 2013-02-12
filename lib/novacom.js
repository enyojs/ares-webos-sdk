/*
 * 
 */

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    winston = require('winston'),
    ssh2 = require('ssh2');

(function () {

	var logger = new (winston.Logger)({
		transports: [
			new (winston.transports.Console)({ level: 'debug' })
		]
	});

	var novacom = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = novacom;
	}

	var keydir = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ssh');

	function makeExecError(cmd, code, signal) {
		var err;
		if (code !== 0) {
			err = new Error("Command '" + cmd + "' exited with code=" + code + " (signal: " + signal + ")");
			err.code = code;
			err.signal = signal;
		}
		return err;
	}

	function Session() {
		this.jobs = [];
		this.ssh = new ssh2();
		this.ssh.on('connect', function() {
			logger.debug("ssh: on connect");
		});
		this.ssh.on('ready', this.runJobs.bind(this));
		this.ssh.on('error', function(err) {
			logger.debug("ssh: on error:" + util.inspect(err));
		});
		this.ssh.on('end', function() {
			logger.debug("ssh: on end");
		});
		this.ssh.on('close', function(had_error) {
			logger.debug("ssh: on close");
		});
		this.ssh.connect({
			host: '127.0.0.1',
			port: 5522,
			username: 'root',
			privateKey: fs.readFileSync(path.join(keydir, 'webos'))
		});
		/*
		 this.ssh.connect({
		 host: '192.168.1.15',
		 port: 22,
		 username: 'fxk',
		 privateKey: fs.readFileSync(path.join(keydir, 'id_rsa'))
		 });
		 */
	}
	
	novacom.Session = Session;

	novacom.Session.prototype = {

		end: function() {
			this.ssh.end();
		},

		runJobs: function() {
			logger.debug("runJobs(): nb=" + this.jobs.length);
			while (this.jobs.length > 0) {
				var job = this.jobs.shift();
				job();
			}
		},

		put: function(outPath, inStream, next) {
			logger.debug("put(): outPath=" + outPath);

			this.jobs.push(this._put.bind(this, outPath, inStream, next));
		},

		_put: function(outPath, inStream, next) {
			logger.debug("_put(): outPath=" + outPath);
			var cmd = '/bin/cat > ' + outPath;
			this.ssh.exec(cmd, (function(err, stream) {
				logger.debug('ssh.exec(): cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
					return;
				}
				stream.on('data', function(data, extended) {
					logger.debug('os: data');
					logger.debug("(" + extended + ") " + data.toString());
				});
				stream.on('exit', function(code, signal) {
					logger.debug('os: exit :: code=' + code + ', signal=' + signal);
					err = makeExecError(cmd, code, signal);
				});
				stream.on('close', function() {
					logger.debug('os: close');
					next(err);
				});
				inStream.on('end', function() {
					logger.debug('is: end');
					stream.end();
 				});
				inStream.pipe(stream, {end: false});
				inStream.resume();
			}).bind(this));
		},

		get: function(inPath, outStream, next) {
			this.jobs.push(this._get.bind(this, inPath, outStream, next));
		},

		_get: function(inPath, outStream, next) {
			var cmd = '/bin/cat ' + inPath;
			this.ssh.exec(cmd, (function(err, stream) {
				if (err) {
					next(err);
					return;
				}
				stream.on('data', function(data, extended) {
					if (extended === 'stderr') {
						process.stderr.write(data);
					} else {
						outStream.write(data);
					}
				});
				stream.on('end', function() {
					logger.debug('inStream :: end');
				});
				stream.on('exit', function(code, signal) {
					logger.debug('os: exit :: code=' + code + ', signal=' + signal);
					err = makeExecError(cmd, code, signal);
				});
				stream.on('close', function() {
					logger.debug('inStream :: close');
					next(err);
				});
			}).bind(this));
		}
	};
}());
