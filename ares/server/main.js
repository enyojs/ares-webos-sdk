/**
 * Hermes Open webos build service
 */

var fs = require("fs"),
    path = require("path"),
    express = require("express"),
    util  = require("util"),
    temp = require("temp"),
    http = require("http"),
    async = require("async"),
    mkdirp = require("mkdirp"),
    optimist = require('optimist'),
    request = require('request'),
    tools = require('../../lib/ipkg-tools'),
    rimraf = require("rimraf"),
    CombinedStream = require('combined-stream');

var basename = path.basename(__filename);
var FORM_DATA_LINE_BREAK = '\r\n';
var performCleanup = true;

function BdOpenwebOS(config, next) {
	function HttpError(msg, statusCode) {
		Error.captureStackTrace(this, this);
		this.statusCode = statusCode || 500; // Internal-Server-Error
		this.message = msg || 'Error';
	}
	util.inherits(HttpError, Error);
	HttpError.prototype.name = "HTTP Error";

	console.log("config=",  util.inspect(config));

	var app, server;
	if (express.version.match(/^2\./)) {
		// express-2.x
		app = express.createServer();
		server = app;
	} else {
		// express-3.x
		app = express();
		server = http.createServer(app);
	}

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
		console.error("errorHandler(): ", err.stack);
		res.status(err.statusCode || 500);
		res.contentType('txt'); // direct usage of 'text/plain' does not work
		res.send(err.toString());
	}

	if (app.error) {
		// express-2.x: explicit error handler
		app.error(errorHandler);
	} else {
		// express-3.x: middleware with arity === 4 is detected as the error handler
		app.use(errorHandler);
	}

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
				cleanup.bind(this)(req, res, next.bind(this, err));
				return;
			}
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
				cleanup.bind(this)(req, res, next.bind(this, err));
				return;
			}
		});
	});

	app.post(makeExpressRoute('/op/launch'), function(req, res, next) {
		async.series([
			launch.bind(this, req, res),
			answerOk.bind(this, req, res)
		], function (err, results) {
			if (err) {
				// cleanup & run express's next() : the errorHandler
				next(err);
				return;
			}
		});
	});

	// Send back the service location information (origin,
	// protocol, host, port, pathname) to the creator, when port
	// is bound
	server.listen(config.port, "127.0.0.1", null /*backlog*/, function() {
		var port = server.address().port;
		return next(null, {
			protocol: 'http',
			host: '127.0.0.1',
			port: port,
			origin: "http://127.0.0.1:"+ port,
			pathname: config.pathname
		});
	});

	function install(req, res, next) {
		console.log("install(): ", req.appDir.packageFile);

		tools.installer.install({verbose: true}, req.appDir.packageFile, function(err, result) {
			console.log("install() DONE: ", err, result);
			if (err) {
				next(err);
				return;
			}
			next();
		});
	}

	function launch(req, res, next) {
		console.log("launch(): ", req.body.id);

		tools.launcher.launch({verbose: true}, req.body.id, null, function(err, result) {
			console.log("launch() DONE: ", err, result);
			if (err) {
				next(err);
				return;
			}
			next();
		});
	}

	function fetchPackage(req, res, next) {
		var packageUrl = req.body.package;
		console.log("fetch(): ", packageUrl);

		req.appDir.packageFile = path.join(req.appDir.root, 'package.ipk');

		var packageStream = fs.createWriteStream(req.appDir.packageFile);
		request(packageUrl).pipe(packageStream);

		// TODO: Handle error cases

		packageStream.on('close', function() {
			console.log('fetchPackage: on close');
			next();
		});
	}

	function answerOk(req, res, next) {
		console.log('Answering 200 OK');
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

		console.log("prepare(): setting-up " + req.appDir.root);
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
			//console.log("store(): mkdir -p ", dir);
			mkdirp(dir, function(err) {
				//console.log("store(): mv ", file.path, " ", file.name);
				if (err) {
					cb(err);
				} else {
					if (file.type.match(/x-encoding=base64/)) {
						fs.readFile(file.path, function(err, data) {
							if (err) {
								console.log("transcoding: error" + file.path, err);
								cb(err);
								return;
							}
							try {
								var fpath = file.path;
								delete file.path;
								fs.unlink(fpath, function(err) { /* Nothing to do */ });

								var filedata = new Buffer(data.toString('ascii'), 'base64');			// TODO: This works but I don't like it
								fs.writeFile(path.join(req.appDir.source, file.name), filedata, function(err) {
									// console.log("store from base64(): Stored: ", file.name);
									cb(err);
								});
							} catch(transcodeError) {
								console.log("transcoding error: " + file.path, transcodeError);
								cb(transcodeError);
							}
						}.bind(this));
					} else {
						fs.rename(file.path, path.join(req.appDir.source, file.name), function(err) {
							// console.log("store(): Stored: ", file.name);
							cb(err);
						});
					}
				}
			});
		}, next);
	}

	function build(req, res, next) {
		console.log("build(): ", req.appDir.source, req.appDir.build);

		tools.packageApp([req.appDir.source], req.appDir.build, {verbose: true}, function(err, result) {
			console.log("build() DONE: ", err, result);
			if (err) {
				next(err);
				return;
			}
			req.ipk = result.ipk;
			next();
		});
	}

	function returnBody(req, res, next) {
		var filename = req.ipk;
		var stats = fs.statSync(filename);
		console.log("returnBody(): size: " + stats.size + " bytes", filename);

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
					return;
				}
				nextDataChunk(data);
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
		if (performCleanup) {
			console.log("cleanup(): rm -rf " + req.appDir.root);
			rimraf(req.appDir.root, function(err) {
				console.log("cleanup(): removed " + req.appDir.root);
				next(err);
			});
		} else {
			console.log("cleanup(): skipping removal of " + req.appDir.root);
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
if (path.basename(process.argv[1]) === basename) {
	// We are main.js: create & run the object...

	var argv = optimist.usage(
		"Ares Open webOS build service\nUsage: $0 [OPTIONS]", {
			'P': {
				description: "URL pathname prefix (before /deploy and /build",
				required: false,
				"default": "/openwebos"
			},
			'p': {
				description: "TCP port number",
				required: false,
				"default": "9029"
			},
			'e': {
				description: "Path to the Enyo version to use for minifying the application",
				required: false,
				"default": path.resolve(__dirname, '..', 'enyo')
			},
			'h': {
				description: "Display help",
				boolean: true,
				required: false
			}
		}).argv;

	if (argv.h) {
		optimist.showHelp();
		process.exit(0);
	}

	var obj = new BdOpenwebOS({
		pathname: argv.P,
		port: parseInt(argv.p, 10),
		enyoDir: argv.e
	}, function(err, service){
		if(err) process.exit(err);
		// process.send() is only available if the
		// parent-process is also node
		if (process.send) process.send(service);
	});

	process.on('SIGINT', obj.onExit.bind(obj));
	process.on('exit', obj.onExit.bind(obj));
} else {

	// ... otherwise hook into commonJS module systems
	module.exports = BdOpenwebOS;
}
