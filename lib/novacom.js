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

	/**
	 * @constructor
	 * @property {Number} _state
	 * @property {Array} _tasks
	 */
	function JobQueue() {
		JobQueue.SETUP = 0;
		JobQueue.READY = 1;
		JobQueue.WORKING = 2;
		this._state = JobQueue.SETUP;
		this._tasks = [];
		logger.debug("JobQueue(): " + util.inspect(this));
	}

	JobQueue.prototype = {
		/**
		 * From this moment, queued jobs are executed
		 */
		start: function() {
			logger.debug("JobQueue#start()");
			if (this._state === JobQueue.SETUP) {
				this._state = JobQueue.READY;
				this.run();
			}
		},
		/**
		 * Add a new job to the queue
		 * @param {Function} job work to be done, accepting a single 'next' function parameter
		 * @param {Function} next user-hook to run after 'job'
		 */
		add: function(job, next) {
			logger.debug("JobQueue#add()");
			this._tasks.push({
				job: job,
				next: next
			});
			if (this._state === JobQueue.READY) {
				this.run();
			}
		},
		/**
		 * @private
		 */
		run: function() {
			logger.debug("JobQueue#run()");
			if (this._state !== JobQueue.READY) {
				throw new Error("Bad state=" + this._state);
			}
			if (this._tasks.length > 0) {
				logger.debug("JobQueue#run(): executing task");
				var task = this._tasks.shift();
				this._state = JobQueue.WORKING;
				task.job((function(err) {
					// execute user-provided 'next', if any
					if (task.next) {
						task.next(err);
					}
					// run our own next: run the next task in queue
					this._state = JobQueue.READY;
					this.run();
				}).bind(this));
			}
		}
	};

	/**
	 * @constructor
	 */
	function Session() {
		this.jobQueue = new JobQueue();
		this.ssh = new ssh2();
		this.ssh.on('connect', function() {
			logger.debug("ssh: on connect");
		});
		this.ssh.on('ready', this.jobQueue.start.bind(this.jobQueue));
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

		/**
		 * Terminates the underlying SSH session
		 */
		end: function() {
			this.ssh.end();
		},

		/**
		 * Add something to be done on the work-queue
		 *
		 * This function is mostly useful to track
		 * asynchronous availability of the underlying SSH
		 * connection.
		 *
		 * @param {Function} job work to be done.  Must take exactly one 'next' {Function} parameter
		 */
		addJob: function(job, next) {
			if (!job) {
				// minimal job must still invoke 'next'
				job = function(next) { next(); };
			}
			this.jobQueue.add(job, next);
		},

		put: function(outPath, inStream, next) {
			logger.debug("put(): outPath=" + outPath);

			this.jobQueue.add(this._put.bind(this, outPath, inStream), next);
		},

		/**
		 * @private
		 */
		_put: function(outPath, inStream, next) {
			var cmd = '/bin/cat > ' + outPath;
			logger.debug("_put(): cmd=" + cmd);
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

		/**
		 * Read a file from the device
		 * @param {String} inPath the device file path to be read
		 * @param {Stream} outStream the writable {Stream} to copy the file into
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		get: function(inPath, outStream, next) {
			logger.debug("get(): inPath=" + inPath);
			this.jobQueue.add(this._get.bind(this, inPath, outStream), next);
		},

		/**
		 * @private
		 */
		_get: function(inPath, outStream, next) {
			var cmd = '/bin/cat ' + inPath;
			logger.debug("_get(): cmd=" + cmd);
			this.ssh.exec(cmd, (function(err, stream) {
				logger.debug('ssh.exec(): cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
					return;
				}
				stream.on('data', function(data, extended) {
					logger.debug('is: on data');
					if (extended === 'stderr') {
						process.stderr.write(data);
					} else {
						outStream.write(data);
					}
				});
				stream.on('end', function() {
					logger.debug('is: on end');
				});
				stream.on('exit', function(code, signal) {
					logger.debug('is: on exit code=' + code + ', signal=' + signal);
					err = makeExecError(cmd, code, signal);
				});
				stream.on('close', function() {
					logger.debug('is: on close');
					next(err);
				});
			}).bind(this));
		}
	};
}());
