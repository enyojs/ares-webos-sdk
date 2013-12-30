/**
 *  Webos build service
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
    rimraf = require("rimraf"),
    CombinedStream = require('combined-stream'),
    tools = require('../../lib/ipkg-tools'),
    novacom = require('../../lib/novacom');

var basename = path.basename(__filename, '.js');
log.heading = basename;
log.level = 'http';

var FORM_DATA_LINE_BREAK = '\r\n';
var performCleanup = true;

process.on('uncaughtException', function (err) {
	log.error(basename, err.stack);
	process.exit(1);
});

var BdBase, HttpError;	// to be loaded from the Ares source tree
var opt = parseParameters();

function BdWebOS(config, next) {
	config.timeout = config.timeout || (2*60*1000);
	if (config.performCleanup === undefined) {
		config.performCleanup = true;
	}

	BdBase.call(this, config, next);
	log.verbose('BdWebOS()', "config:",  this.config);
}
util.inherits(BdWebOS, BdBase);

BdWebOS.prototype.use = function() {
	this.app.use(this.errorHandler);
};

BdWebOS.prototype.route = function() {
	this.app.use(this.makeExpressRoute('/devices/load'), this.load.bind(this));
	this.app.use(this.makeExpressRoute('/devices/save'), this.save.bind(this));
	this.app.use(this.makeExpressRoute('/devices/requestKey'), this.requestKey.bind(this));
	this.app.use(this.makeExpressRoute('/op/build'), this.build.bind(this));
	this.app.use(this.makeExpressRoute('/op/install'), this.install.bind(this));
	this.app.use(this.makeExpressRoute('/op/launch'), this.launch.bind(this));
	this.app.use(this.makeExpressRoute('/op/debug'), this.debug.bind(this));
};

BdWebOS.prototype.errorHandler = function(err, req, res, next){
	log.error("errorHandler()", err.stack);
	res.status(err.statusCode || 500);
	res.contentType('txt'); // direct usage of 'text/plain' does not work
	res.send(err.toString());
};

/**
 * @protected
 */
BdWebOS.prototype.cleanSession = function(req, res, next) {
	var dir = req.appDir && req.appDir.root;
	if (this.config.performCleanup && dir) {
		log.verbose("BdBase#cleanSession()", "rm -rf " + dir);
		rimraf(req.appDir.root, function(err) {
			log.verbose("BdBase#cleanSession()", "removed", dir);
			delete req.appDir;
			next(err);
		});
	} else {
		log.verbose("BdBase#cleanSession()", "skipping removal of", dir);
		setImmediate(next);
	}
};

/**
 * @protected
 */
BdWebOS.prototype.prepare = function(req, res, next) {
	var appTempDir = temp.path({prefix: 'com.palm.ares.hermes.' + this.config.basename + '.'}) + '.d';
	req.appDir = {
		root: appTempDir,
		source: path.join(appTempDir, 'source'),
		build: path.join(appTempDir, 'build'),
		deploy: path.join(appTempDir, 'deploy')
	};
	req.storeDir = req.appDir.source;

	log.verbose("prepare()", "setting-up " + req.appDir.root);
	async.series([
		function(done) { mkdirp(req.appDir.root, done); },
		function(done) { fs.mkdir(req.appDir.source, done); },
		function(done) { fs.mkdir(req.appDir.build, done); },
		function(done) { fs.mkdir(req.appDir.deploy, done); }
	], next);
};

BdWebOS.prototype.load = function(req, res, next) {
	var self = this;
	async.series([
		_loadDevices.bind(this, req, res),
		_returnDevicesData.bind(this, req, res)
	], function (err, results) {
		if (err) {
			self.cleanSession(req, res, function() {
				log.error('/devices/load', err.stack);
				err.stack = null;
				next(err);
			});
		}
	});

	function _loadDevices(req, res, next){
		var resolver = new novacom.Resolver();
		async.waterfall([
			resolver.load.bind(resolver),
			resolver.list.bind(resolver),
			function(devices, next) {
				log.info("loadDevices()", "devices:", devices);
				for(var i in devices){
					// delete unused data
					if(devices[i]["privateKey"])
						devices[i]["privateKey"] = true;
					else
						devices[i]["privateKey"] = false;
					delete devices[i]["addr"];
				}
				req.devices = devices;
				next();
			}
		], next);
	}

	function _returnDevicesData(req, res, next){
		var devices = req.devices;
		res.status(200);
		res.send(devices);	
	}
};

BdWebOS.prototype.save = function(req, res, next) {
	var self = this;
	async.series([
		_saveDevices.bind(this, req, res),
		this.answerOk.bind(this, req, res)
	], function (err, results) {
		if (err) {
			self.cleanSession(req, res, function() {
				log.error('/devices/save', err.stack);
				err.stack = null;
				next(err);
			});
		}
	});

	function _saveDevices(req, res, next){
		var resolver = new novacom.Resolver();
		var devicesData = [];
		for(var i in req.body){
			devicesData.push(JSON.parse(req.body[i]));
		}
		async.waterfall([
			resolver.save.bind(resolver, devicesData)
		], next);
	}
};

BdWebOS.prototype.requestKey = function(req, res, next) {
	var self = this;
	async.series([
		_getSshPrvKey.bind(this, req, res),
		this.answerOk.bind(this, req, res)
	], function (err, results) {
		if (err) {
			self.cleanSession(req, res, function() {
				log.error('/devices/requestKey', err.stack);
				err.stack = null;
				next(err);
			});
		}
	});

	function _getSshPrvKey(req, res, next){
		var resolver = new novacom.Resolver();
		async.waterfall([
			resolver.load.bind(resolver),
			resolver.getSshPrvKey.bind(resolver, {verbose: true, name: req.body.device})
		], next);
	}
};

BdWebOS.prototype.build = function(req, res, next) {
	var self = this;
	async.series([
		this.prepare.bind(this, req, res),
		this.store.bind(this, req, res),
		_build.bind(this, req, res),
		_returnBody.bind(this, req, res),
		this.cleanSession.bind(this, req, res)
	], function (err, results) {
		if (err) {
			// cleanup & run express's next() : the errorHandler
			self.cleanSession(req, res, function() {
				log.error('/op/build', err.stack);
				err.stack = null;
				next(err);
			});
		}
		// we do not invoke error-less next() here
		// because that would try to return 200 with
		// an empty body, while we have already sent
		// back the response.
	});

	function _build(req, res, next) {
		log.info("build()", req.appDir.source, req.appDir.build);
		var minifymode = true;
		if(req.query.minifymode !== "true")
			minifymode = false;

		tools.packageApp([req.appDir.source], req.appDir.build, {verbose: true, minify: minifymode}, 
				 function(err, result) {
					 log.verbose("build()", err, result);
					 if (err) {
						 next(err);
					 } else {
						 req.ipk = result.ipk;
						 next();
					 }
				 }
				);
	}

	function _returnBody(req, res, next) {
		var filename = req.ipk;
		var stats = fs.statSync(filename);
		log.verbose("returnBody()", "size: " + stats.size + " bytes", filename);

		// Build the multipart/formdata
		var combinedStream = CombinedStream.create();
		var boundary = _generateBoundary();

		// Adding part header
		combinedStream.append(_getPartHeader(path.basename(filename), boundary));
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
		combinedStream.append(_getPartFooter());

		// Adding last footer
		combinedStream.append(_getLastPartFooter(boundary));

		// Send the files back as a multipart/form-data
		res.status(200);
		res.header('Content-Type', _getContentTypeHeader(boundary));
		combinedStream.pipe(res);

		// cleanup the temp dir when the response has been sent
		combinedStream.on('end', function() {
			next();
		});
	}


	function _generateBoundary() {
		// This generates a 50 character boundary similar to those used by Firefox.
		// They are optimized for boyer-moore parsing.
		var boundary = '--------------------------';
		for (var i = 0; i < 24; i++) {
			boundary += Math.floor(Math.random() * 10).toString(16);
		}

		return boundary;
	}

	function _getContentTypeHeader(boundary) {
		return 'multipart/form-data; boundary=' + boundary;
	}

	function _getPartHeader(filename, boundary) {
		var header = '--' + boundary + FORM_DATA_LINE_BREAK;
		header += 'Content-Disposition: form-data; name="file"';

		header += '; filename="' + filename + '"' + FORM_DATA_LINE_BREAK;

		// 'Content-transfer-Encoding: base64' require
		// 76-column data, to not break
		// 'connect.bodyParser()'... so we use out own
		// 'ServiceBase.bodyParser()'.
		header += 'Content-Type: application/octet-stream' + FORM_DATA_LINE_BREAK;
		header += 'Content-Transfer-Encoding: base64' + FORM_DATA_LINE_BREAK;

		header += FORM_DATA_LINE_BREAK;
		return header;
	}

	function _getPartFooter() {
		return FORM_DATA_LINE_BREAK;
	}

	function _getLastPartFooter(boundary) {
		return '--' + boundary + '--';
	}
};

BdWebOS.prototype.install = function(req, res, next) {
	var self = this;
	async.series([
		this.close.bind(this, req, res),
		this.prepare.bind(this, req, res),
		this.fetchPackage.bind(this, req, res),
		_install.bind(this, req, res),
		this.answerOk.bind(this, req, res),
		this.cleanSession.bind(this, req, res)
	], function (err, results) {
		if (err) {
			// cleanup & run express's next() : the errorHandler
			self.cleanSession(req, res, function() {
				log.error('/op/install', err.stack);
				err.stack = null;
				next(err);
			});
		}
		// we do not invoke error-less next() here
		// because that would try to return 200 with
		// an empty body, while we have already sent
		// back the response.
	});

	function _install(req, res, next) {
		log.info("install()", req.appDir.packageFile);

		tools.installer.install({verbose: true, appId:req.body.appId, device:req.body.device, installMode:req.body.installMode}, req.appDir.packageFile, function(err, result) {
			log.verbose("install()", err, result);
			next(err);
		});
	}
};

BdWebOS.prototype.launch = function(req, res, next) {
	var self = this;
	async.series([
		_launch.bind(this, req, res),
		this.answerOk.bind(this, req, res)
	], function (err, results) {
		if (err) {
			// cleanup & run express's next() : the errorHandler
			self.cleanSession(req, res, function() {
				log.error('/op/launch', err.stack);
				err.stack = null;
				next(err);
			});
		}
		// we do not invoke error-less next() here
		// because that would try to return 200 with
		// an empty body, while we have already sent
		// back the response.
	});

	function _launch(req, res, next) {
		log.info("launch()", req.body.id);

		var userhome = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
		var hostedurl = userhome + req.body.hostedurl;
		tools.launcher.launch({verbose: true, device: req.body.device, installMode:req.body.installMode, hostedurl:hostedurl}, req.body.id, null, function(err, result) {
			log.verbose("launch()", err, result);
			next(err);
		});
	}
};

BdWebOS.prototype.debug = function(req, res, next) {
	var self = this;
	async.series([
		_debug.bind(this, req, res)
	], function (err, results) {
		if (err) {
			// cleanup & run express's next() : the errorHandler
			self.cleanSession(req, res, function() {
				log.error('/op/debug', err.stack);
				err.stack = null;
				next(err);
			});
		}
		// we do not invoke error-less next() here
		// because that would try to return 200 with
		// an empty body, while we have already sent
		// back the response.
	});

	function _debug(req, res, next) {
		log.info("debug()", req.body.id);
		res.status(200).send();
		tools.inspector.inspect({verbose: true, device: req.body.device, appId: req.body.appId, serviceId: req.body.serviceId, installMode:req.body.installMode}, null, function(err, result) {
			log.verbose("debug()", err, result);
			next(err);
		});
	}
};

BdWebOS.prototype.close = function(req, res, next) {
	var appId = req.body.id || req.body.appId;
	log.info("close()", appId);

	tools.launcher.close({verbose: true, device: req.body.device}, appId, null, function(err, result) {
		log.verbose("close()", err, result);
		//FIXME: Currently new webos doesn't support re-launch, 
		//       so alternatively use 'close->lauch'
		//       until supporting re-launch properly, just ignore closing error.
		//next(err);
		next();
	});
};

BdWebOS.prototype.fetchPackage = function(req, res, next) {
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
};

function parseParameters() {
	if (path.basename(process.argv[1], '.js') === basename) {
		// We are main.js: create & run the object...

		var knownOpts = {
			"install-dir":	path,
			"port":		Number,
			"timeout":	Number,
			"pathname":	String,
			"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
			"help":		Boolean
		};
		var shortHands = {
			"I": "--install-dir",
			"p": "--port",
			"t": "--timeout",
			"P": "--pathname",
			"l": "--level",
			"v": "--level verbose",
			"h": "--help"
		};
		var helpString = [
			"Usage: node " + basename,
			"  -I, --install-dir location where the Ares server is runnig from                                   [default: '$CWD']",
			"  -p, --port        port (o) local IP port of the express server (0: dynamic)                       [default: '0']",
			"  -t, --timeout     milliseconds of inactivity before a server socket is presumed to have timed out [default: '240000']",
			"  -P, --pathname    URL pathname prefix (before /minify and /build                                  [default: '/webos']",
			"  -l, --level       debug level ('silly', 'verbose', 'info', 'http', 'warn', 'error')               [default: 'http']",
			"  -h, --help        This message"
		];
		var argv = require('nopt')(knownOpts, shortHands, process.argv, 2 /*drop 'node' & basename*/);
		log.level = argv.level || "http";
		if (argv.help) {
			helpString.forEach(function(line) {
				console.log(line);
			});
			process.exit(0);
		}
		argv.aresDir = argv["install-dir"] || process.cwd();
		argv["install-dir"] = null;
		BdBase = require(path.resolve(argv.aresDir, 'hermes', 'lib', 'bdBase')),
		HttpError = require(path.resolve(argv.aresDir, 'hermes', 'lib', 'httpError'));
		return argv;
	}
} // function parseParameters()

if (path.basename(process.argv[1], '.js') === basename) {
	new BdWebOS({
		pathname: opt.pathname,
		port: opt.port,
		timeout: opt.timeout,
		basename: basename,
		enyoDir: path.resolve(opt.aresDir, 'enyo'), // Use the Enyo version provided by Ares
		level: opt.level
	}, function(err, service){
		if(err) {
			process.exit(err);
		}
		// process.send() is only available if the
		// parent-process is also node
		if (process.send) {
			process.send(service);
		}
	});
} else {
	// ... otherwise hook into commonJS module systems
	module.exports = BdWebOS;
}
