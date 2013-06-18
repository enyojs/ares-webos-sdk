/**
 * Hermes Open webos build service
 */

var fs = require("fs"),
    path = require("path"),
    express = require("express"),
    util  = require("util"),
    log = require('npmlog'),
    temp = require("temp"),
    http = require("http"),
    async = require("async"),
    mkdirp = require("mkdirp"),
    request = require('request'),
    tools = require('../../lib/ipkg-tools'),
    rimraf = require("rimraf"),
    CombinedStream = require('combined-stream');

var basename = path.basename(__filename, '.js');
log.heading = basename;
log.level = 'http';

var FORM_DATA_LINE_BREAK = '\r\n';
var performCleanup = true;

process.on('uncaughtException', function (err) {
	log.error(basename, err.stack);
	process.exit(1);
});

function BdOpenwebOS(config, next) {
	function HttpError(msg, statusCode) {
		Error.captureStackTrace(this, this);
		this.statusCode = statusCode || 500; // Internal-Server-Error
		this.message = msg || 'Error';
	}
	util.inherits(HttpError, Error);
	HttpError.prototype.name = "HTTP Error";

	log.info('BdOpenwebOS', "config:", config);

	// express 3.x: app is not a server
	var app, server;
	app = express();
	server = http.createServer(app);

	/*
	 * Middleware -- applied to every verbs
	 */
	if (!this.quiet) {
		app.use(express.logger('dev'));
	}

	/**
	 * Make sane Express matching paths
	 * @private
	 */
	function makeExpressRoute(path) {
		return (config.pathname + path)
			.replace(/\/+/g, "/") // compact "//" into "/"
			.replace(/(\.\.)+/g, ""); // remove ".."
	}

	// CORS -- Cross-Origin Resources Sharing
	app.use(function(req, res, next) {
		res.header('Access-Control-Allow-Origin', "*"); // XXX be safer than '*'
		res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
		if ('OPTIONS' == req.method) {
			res.status(200).end();
		}
		else {
			next();
		}
	});

	// Authentication
	app.use(function(req, res, next) {
		if (req.connection.remoteAddress !== "127.0.0.1") {
			next(new Error("Access denied from IP address "+req.connection.remoteAddress));
		} else {
			next();
		}
	});

	// Built-in express form parser: handles:
	// - 'application/json' => req.body
	// - 'application/x-www-form-urlencoded' => req.body
	// - 'multipart/form-data' => req.body.<field>[], req.body.file[]
	this.uploadDir = temp.path({prefix: 'com.palm.ares.hermes.bdOpenwebOS'}) + '.d';
	fs.mkdirSync(this.uploadDir);
	app.use(express.bodyParser({keepExtensions: true, uploadDir: this.uploadDir}));

	// Global error handler
	function errorHandler(err, req, res, next){
		log.error("errorHandler()", err.stack);
		res.status(err.statusCode || 500);
		res.contentType('txt'); // direct usage of 'text/plain' does not work
		res.send(err.toString());
	}

	// express-3.x: middleware with arity === 4 is detected as the error handler
	app.use(errorHandler);

	/*
	 * Verbs
	 */
	app.post(makeExpressRoute('/op/build'), function(req, res, next) {
		async.series([
			prepare.bind(this, req, res),
			store.bind(this, req, res),
			build.bind(this, req, res),
			returnBody.bind(this, req, res),
			cleanup.bind(this, req, res)
		], function (err, results) {
			if (err) {
				// cleanup & run express's next() : the errorHandler
				cleanup.bind(this)(req, res, function() {
					next(err);
				});
			}
			// we do not invoke error-less next() here
			// because that would try to return 200 with
			// an empty body, while we have already sent
			// back the response.
		});
	});

	app.post(makeExpressRoute('/op/install'), function(req, res, next) {
		async.series([
			prepare.bind(this, req, res),
			fetchPackage.bind(this, req, res),
			install.bind(this, req, res),
			answerOk.bind(this, req, res),
			cleanup.bind(this, req, res)
		], function (err, results) {
			if (err) {
				// cleanup & run express's next() : the errorHandler
				cleanup.bind(this)(req, res, function() {
					next(err);
				});
			}
			// we do not invoke error-less next() here
			// because that would try to return 200 with
			// an empty body, while we have already sent
			// back the response.
		});
	});

	app.post(makeExpressRoute('/op/launch'), function(req, res, next) {
		async.series([
			launch.bind(this, req, res),
			answerOk.bind(this, req, res)
		], function (err, results) {
			if (err) {
				// cleanup & run express's next() : the errorHandler
				cleanup.bind(this)(req, res, function() {
					next(err);
				});
			}
			// we do not invoke error-less next() here
			// because that would try to return 200 with
			// an empty body, while we have already sent
			// back the response.
		});
	});

	app.post(makeExpressRoute('/op/debug'), function(req, res, next) {
		async.series([
			debug.bind(this, req, res)
		], function (err, results) {
			if (err) {
				// cleanup & run express's next() : the errorHandler
				cleanup.bind(this)(req, res, function() {
					next(err);
				});
			}
			// we do not invoke error-less next() here
			// because that would try to return 200 with
			// an empty body, while we have already sent
			// back the response.
		});
	});

	// Send back the service location information (origin,
	// protocol, host, port, pathname) to the creator, when port
	// is bound
	server.listen(config.port, "127.0.0.1", null /*backlog*/, function() {
		var tcpAddr = server.address();
		return next(null, {
			protocol: 'http',
			host: tcpAddr.address,
			port: tcpAddr.port,
			origin: "http://" + tcpAddr.address + ":"+ tcpAddr.port,
			pathname: config.pathname
		});
	});

	function install(req, res, next) {
		log.info("install()", req.appDir.packageFile);

		tools.installer.install({verbose: true, appId:req.body.appid, device:req.body.device}, req.appDir.packageFile, function(err, result) {
			log.verbose("install()", err, result);
			next(err);
		});
	}

	function launch(req, res, next) {
		log.info("launch()", req.body.id);

		tools.launcher.launch({verbose: true, device: req.body.device}, req.body.id, null, function(err, result) {
			log.verbose("launch()", err, result);
			next(err);
		});
	}

	function debug(req, res, next) {
		log.info("debug()", req.body.id);
		res.status(200).send();
		tools.inspector.inspect({verbose: true, device: req.body.device, appId: req.body.id}, null, function(err, result) {
			log.verbose("debug()", err, result);
			next(err);
		});
	}

	function fetchPackage(req, res, next) {
		try {
			var packageUrl = req.body.package;
			log.http("fetch()", packageUrl);

			req.appDir.packageFile = path.join(req.appDir.root, 'package.ipk');
			
			var packageStream = fs.createWriteStream(req.appDir.packageFile);
			request(packageUrl).pipe(packageStream);
			
			packageStream.on('close', next);
			packageStream.on('error', next);
		} catch(err) {
			next(err);
		}
	}

	function answerOk(req, res, next) {
		log.verbose("answerOk()", '200 OK');
		res.status(200).send();
	}

	function prepare(req, res, next) {
		var appTempDir = temp.path({prefix: 'com.palm.ares.hermes.owo.'}) + '.d';
		req.appDir = {
			root: appTempDir,
			source: path.join(appTempDir, 'source'),
			build: path.join(appTempDir, 'build'),
			deploy: path.join(appTempDir, 'deploy')
		};

		log.verbose("prepare()", "setting-up " + req.appDir.root);
		async.series([
			function(done) { mkdirp(req.appDir.root, done); },
			function(done) { fs.mkdir(req.appDir.source, done); },
			function(done) { fs.mkdir(req.appDir.build, done); },
			function(done) { fs.mkdir(req.appDir.deploy, done); }
		], next);
	}

	function store(req, res, next) {
		if (!req.is('multipart/form-data')) {
			next(new HttpError("Not a multipart request", 415 /*Unsupported Media Type*/));
			return;
		}

		if (!req.files.file) {
			next(new HttpError("No file found in the multipart request", 400 /*Bad Request*/));
			return;
		}

		async.forEachSeries(req.files.file, function(file, cb) {
			var dir = path.join(req.appDir.source, path.dirname(file.name));
			log.silly("store()", "mkdir -p ", dir);
			mkdirp(dir, function(err) {
				log.silly("store()", "mv ", file.path, " ", file.name);
				if (err) {
					cb(err);
				} else {
					if (file.type.match(/x-encoding=base64/)) {
						fs.readFile(file.path, function(err, data) {
							if (err) {
								log.info("store()", "transcoding: error" + file.path, err);
								cb(err);
								return;
							}
							try {
								var fpath = file.path;
								delete file.path;
								fs.unlink(fpath, function(err) { /* Nothing to do */ });

								var filedata = new Buffer(data.toString('ascii'), 'base64');			// TODO: This works but I don't like it
								fs.writeFile(path.join(req.appDir.source, file.name), filedata, function(err) {
									log.silly("store()", "from base64(): Stored: ", file.name);
									cb(err);
								});
							} catch(transcodeError) {
								log.warn("store()", "transcoding error: " + file.path, transcodeError);
								cb(transcodeError);
							}
						}.bind(this));
					} else {
						fs.rename(file.path, path.join(req.appDir.source, file.name), function(err) {
							log.silly("store()", "Stored: ", file.name);
							cb(err);
						});
					}
				}
			});
		}, next);
	}

	function build(req, res, next) {
		log.info("build()", req.appDir.source, req.appDir.build);

		tools.packageApp([req.appDir.source], req.appDir.build, {verbose: true}, function(err, result) {
			log.verbose("build()", err, result);
			if (err) {
				next(err);
			} else {
				req.ipk = result.ipk;
				next();
			}
		});
	}

	function returnBody(req, res, next) {
		var filename = req.ipk;
		var stats = fs.statSync(filename);
		log.verbose("returnBody()", "size: " + stats.size + " bytes", filename);

		// Build the multipart/formdata
		var combinedStream = CombinedStream.create();
		var boundary = generateBoundary();

		// Adding part header
		combinedStream.append(getPartHeader(path.basename(filename), boundary));
		// Adding file data
		combinedStream.append(function(nextDataChunk) {
			fs.readFile(filename, 'base64', function (err, data) {
				if (err) {
					next('Unable to read ' + filename);
					nextDataChunk('INVALID CONTENT');
				} else {
					nextDataChunk(data);
				}
			});
		});

		// Adding part footer
		combinedStream.append(getPartFooter());

		// Adding last footer
		combinedStream.append(getLastPartFooter(boundary));

		// Send the files back as a multipart/form-data
		res.status(200);
		res.header('Content-Type', getContentTypeHeader(boundary));
		combinedStream.pipe(res);

		// cleanup the temp dir when the response has been sent
		combinedStream.on('end', function() {
			next();
		});
	}

	function cleanup(req, res, next) {
		var dir = req.appDir && req.appDir.root;
		if (performCleanup && dir) {
			log.verbose("cleanup()", "rm -rf " + dir);
			rimraf(req.appDir.root, function(err) {
				log.verbose("cleanup()", "removed " + dir);
				next(err);
			});
		} else {
			log.verbose("cleanup()", "skipping removal of " + dir);
			next();
		}
	}

	function generateBoundary() {
		// This generates a 50 character boundary similar to those used by Firefox.
		// They are optimized for boyer-moore parsing.
		var boundary = '--------------------------';
		for (var i = 0; i < 24; i++) {
			boundary += Math.floor(Math.random() * 10).toString(16);
		}

		return boundary;
	}

	function getContentTypeHeader(boundary) {
		return 'multipart/form-data; boundary=' + boundary;
	}

	function getPartHeader(filename, boundary) {
		var header = '--' + boundary + FORM_DATA_LINE_BREAK;
		header += 'Content-Disposition: form-data; name="file"';

		header += '; filename="' + filename + '"' + FORM_DATA_LINE_BREAK;
		header += 'Content-Type: application/octet-stream; x-encoding=base64';

		header += FORM_DATA_LINE_BREAK + FORM_DATA_LINE_BREAK;
		return header;
	}

	function getPartFooter() {
		return FORM_DATA_LINE_BREAK;
	}

	function getLastPartFooter(boundary) {
		return '--' + boundary + '--';
	}
}

BdOpenwebOS.prototype.onExit = function() {
	var directory = this.uploadDir;
	rimraf(directory, function(err) {
		// Nothing to do
	});
};

// Main
if (path.basename(process.argv[1], '.js') === basename) {
	// We are main.js: create & run the object...

	var knownOpts = {
		"port":		Number,
		"pathname":	String,
		"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
		"help":		Boolean
	};
	var shortHands = {
		"p": "port",
		"P": "pathname",
		"l": "--level",
		"v": "--level verbose",
		"h": "help"
	};
	var argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
	argv.pathname = argv.pathname || "/phonegap";
	argv.port = argv.port || 0;
	argv.level = argv.level || "http";
	if (argv.help) {
		console.log("Usage: node " + basename + "\n" +
			    "  -p, --port        port (o) local IP port of the express server (0: dynamic)         [default: '0']\n" +
			    "  -P, --pathname    URL pathname prefix (before /deploy and /build                    [default: '/phonegap']\n" +
			    "  -l, --level       debug level ('silly', 'verbose', 'info', 'http', 'warn', 'error') [default: 'http']\n" +
			    "  -h, --help        This message\n");
		process.exit(0);
	}

	var obj = new BdOpenwebOS({
		pathname: argv.pathname,
		port: argv.port,
		enyoDir: path.resolve(__dirname, '..', 'enyo')
	}, function(err, service){
		if(err) process.exit(err);
		// process.send() is only available if the
		// parent-process is also node
		if (process.send) process.send(service);
	});

} else {

	// ... otherwise hook into commonJS module systems
	module.exports = BdOpenwebOS;
}
