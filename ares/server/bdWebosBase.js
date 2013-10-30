/*jshint node: true, strict: false, globalstrict: false */

var fs = require("graceful-fs"),
    path = require("path"),
    express = require("express"),
    util  = require("util"),
    createDomain = require('domain').create,
    log = require('npmlog'),
    http = require("http"),
    mkdirp = require("mkdirp"),
    CombinedStream = require('combined-stream'),
    base64 = require('base64-stream'),
    Busboy = require('busboy'),
    Readable = require('stream').Readable,
    HttpError = require("./httpError");

module.exports = BdWebosBase;

/**
 * Base object for Ares services
 * 
 * @param {Object} config
 * @property config {String} port requested IP port (0 for dynamic allocation, the default)
 * @property config {String} pathname location after the service origin, defaults to '/'
 * @property config {String} basename child class name (for tracing)
 * @property config {Boolean} performCleanup clean temporary files & folders (default to true)
 * @property service {Number} timeout HTTP timeout in ms (12000)
 * 
 * @param {Function} next
 * @param {Error} next err
 * @param {Object} next service
 * @property service {String} protocol in ['http', 'https']
 * @property service {String} host IP address the server is bound to (useful in case of dynamic allocation)
 * @property service {String} port the server is bound to (useful in case of dynamic allocation)
 * @property service {String} origin consolidated string of protocol, host & port
 * @property service {String} pathname to locat the service behind the origin
 * 
 * @public
 */
function BdWebosBase(config, next) {
	config.timeout = config.timeout || (4*60*1000);
	config.port = config.port || 0;
	config.pathname = config.pathname || '/';
	if (config.performCleanup === undefined) {
		config.performCleanup = true;
	}
	if (config.level) {
		log.level = config.level;
	}

	this.config = config;
	log.info('BdWebosBase()', "config:", this.config);

	// express 3.x: app is not a server
	this.app = express();
	this.server = http.createServer(this.app);
	this.server.setTimeout(config.timeout);

	/*
	 * Middleware -- applied to every verbs
	 */
	if (log.level !== 'error' && log.level !== 'warn') {
		this.app.use(express.logger('dev'));
	}

	/*
	 * Error Handling - Wrap exceptions in delayed handlers
	 */
	this.app.use(function _useDomain(req, res, next) {
		log.silly("BdWebosBase#_useDomain()");
		var domain = createDomain();

		domain.on('error', function(err) {
			setImmediate(next, err);
			domain.dispose();
		});

		domain.enter();
		setImmediate(next);
	});

	// CORS -- Cross-Origin Resources Sharing
	this.app.use(this.setCors.bind(this));

	// Authentication
	this.app.use(this.allowLocalOnly.bind(this));

	// Small content
	this.app.use(this.bodyParser.bind(this));

	this.use();

	/*
	 * verbs
	 */
	this.app.post('/config', (function(req, res , next) {
		this.configure(req.body && req.body.config, function(err) {
			if (err) {
				next(err);
			} else {
				res.status(200).end();
			}
		});
	}).bind(this));

	this.route();

	/*
	 * error handling: express-3.x: middleware with arity === 4 is
	 * detected as the global error handler
	 */
	this.app.use(this.errorHandler.bind(this));

	// Send back the service location information (origin,
	// protocol, host, port, pathname) to the creator, when port
	// is bound
	this.server.listen(config.port, "127.0.0.1", null /*backlog*/, (function() {
		var tcpAddr = this.server.address();
		setImmediate(next, null, {
			protocol: 'http',
			host: tcpAddr.address,
			port: tcpAddr.port,
			origin: "http://" + tcpAddr.address + ":"+ tcpAddr.port,
			pathname: config.pathname
		});
	}).bind(this));
}

/**
 * Make sane Express matching paths
 * @protected
 */
BdWebosBase.prototype.makeExpressRoute = function(path) {
	return (this.config.pathname + path)
		.replace(/\/+/g, "/") // compact "//" into "/"
		.replace(/(\.\.)+/g, ""); // remove ".."
};

/**
 * @param {Object} config
 * @propery config {} basename
 * @property config {int} maxDataSize used by https://npmjs.org/package/combined-stream
 * @propery config {String} pathname 
 * @propery config {int} port
 * @protected
 */
BdWebosBase.prototype.configure = function(config, next) {
	log.silly("BdWebosBase#configure()", "old config:", this.config);
	log.silly("BdWebosBase#configure()", "inc config:", config);
	util._extend(this.config, config);
	log.verbose("BdWebosBase#configure()", "new config:", this.config);
	setImmediate(next);
};

/**
 * Additionnal middlewares: 'this.app.use(xxx)'
 * @protected
 */
BdWebosBase.prototype.use = function(/*config, next*/) {
	log.verbose('BdWebosBase#use()', "skipping..."); 
};

/**
 * Additionnal routes/verbs: 'this.app.get()', 'this.app.post()'
 * @protected
 */
BdWebosBase.prototype.route = function(/*config, next*/) {
	log.verbose('BdWebosBase#route()', "skipping..."); 
};

/**
 * @protected
 */
BdWebosBase.prototype.setCors = function(req, res, next) {
	log.silly("BdWebosBase#setCors()");
	res.header('Access-Control-Allow-Origin', "*"); // XXX be safer than '*'
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, , X-HTTP-Method-Override');
	if ('OPTIONS' == req.method) {
		res.status(200).end();
	}
	else {
		setImmediate(next);
	}
};

/**
 * @protected
 */
BdWebosBase.prototype.allowLocalOnly = function(req, res, next) {
	log.silly("BdWebosBase#authorize()");
	if (req.connection.remoteAddress !== "127.0.0.1") {
		setImmediate(next, new Error("Access denied from IP address "+req.connection.remoteAddress));
	} else {
		setImmediate(next);
	}
};

/**
 * @protected
 */
BdWebosBase.prototype.setCookie = function(res, key, value) {
	var exdate=new Date();
	exdate.setDate(exdate.getDate() + 10 /*days*/);
	var cookieOptions = {
		domain: '127.0.0.1:' + this.config.port,
		path: this.config.pathname,
		httpOnly: true,
		expires: exdate
		//maxAge: 1000*3600 // 1 hour
	};
	res.cookie(key, value, cookieOptions);
	log.info('BdWebosBase#setCookie()', "Set-Cookie: " + key + ":", value || "");
};

/**
 * Global error handler (arity === 4)
 * @protected
 */
BdWebosBase.prototype.errorHandler = function(err, req, res, next){
	log.error("BdWebosBase#errorHandler()", err.stack);
	res.status(err.statusCode || 500);
	res.contentType('txt'); // direct usage of 'text/plain' does not work
	res.send(err.toString());
	this.cleanSession(req, res, next);
};

/**
 * @protected
 */
BdWebosBase.prototype.cleanSession = function(req, res, next) {
	log.verbose("BdWebosBase#cleanSession()", 'nothing to do');
};

/**
 * @protected
 */
BdWebosBase.prototype.answerOk = function(req, res /*, next*/) {
	log.verbose("BdWebosBase#answerOk()", '200 OK');
	res.status(200).send();
};

/**
 * @protected
 * @param {http.Request} req inbound HTTP request 
 * @property req {path} storeDir where to store the file parts of the request
 * @param {http.Response} res outbound HTTP response
 * @param {Function} next commonJS callback
 * @see {BdWebosBase._storeMultiPart}
 */
BdWebosBase.prototype.store = function(req, res, next) {
	log.verbose("BdWebosBase#store()");

	if (req.is('multipart/form-data')) {
		this._storeMultipart(req, _storeOne, next);
	} else {
		setImmediate(next, new HttpError("Not a multipart request", 415 /*Unsupported Media Type*/));
		return;
	}

	function _storeOne(file, next) {
		var absPath = path.join(req.storeDir, file.name);
		mkdirp(path.dirname(absPath), function(err) {
			var out = fs.createWriteStream(absPath);
			out.on('error', function(err) {
				log.warn("BdWebosBase#store#_storeOne()", "err:", err);
				next(err);
			});
			out.on('close', function() {
				log.silly("BdWebosBase#store#_storeOne()", "wrote:", absPath);
				next();
			});
			file.stream.pipe(out);
		});
	}
};

/**
 * @see {FsBase._putMultipart}
 */
BdWebosBase.prototype._storeMultipart = function(req, storeOne, next) {
	log.verbose("BdWebosBase#_storeMultipart()");

	this.receiveFormData(req, _receiveFile, _receiveField, next);

	function _receiveFile(fieldName, fieldValue, next, fileName, encoding) {
		log.silly("BdWebosBase#_storeMultipart#_receiveFile()", "fieldName:", fieldName, "fileName:", fileName, "encoding:", encoding);
		if (fieldName === "file" || fieldName === "blob" || fieldName === ".") {
			fieldName = undefined;
		}
		if (fileName === "file" || fileName === "blob" || fileName === ".") {
			fileName = undefined;
		}
		var file = {
			name: fieldName || fileName,
			stream: encoding === 'base64' ? fieldValue.pipe(base64.decode()) : fieldValue
		};
		storeOne(file, next);
	}

	function _receiveField(fieldName, fieldValue) {
		log.warn("BdWebosBase#_storeMultipart#_receiveField()", "unexpected field:",fieldName , "fieldValue:", fieldValue );
	}
};


/**
 * @protected
 * @param {http.Request} req inbound HTTP request 
 * @param {http.Response} res outbound HTTP response
 * @property res {path} file file to be sent back as the body of the response (Content-Type is automatic)
 * @param {Function} next commonJS callback
 */
BdWebosBase.prototype.returnFile = function(req, res, next) {
	res.status(200).sendfile(res.file);
	delete res.file;
	setImmediate(next);
};

/**
 * @protected
 * @param {http.Request} req inbound HTTP request 
 * @param {http.Response} res outbound HTTP response
 * @property res {Object} body
 * @property res {String} contentType force 'Content-Type' response header (otherwise set automatically by express)
 * @param {Function} next commonJS callback
 */
BdWebosBase.prototype.returnBody = function(req, res, next) {
	if (res.contentType) {
		// Otherwise count on express to detect the
		// content-type
		res.header('content-type', res.contentType);
	}
	res.status(200).send(res.body);
	delete res.body;
	delete res.contentType;
	setImmediate(next);
};

/**
 * @param {Array} parts
 * @item parts {Object} part
 * @property part {String} [filename] name to put in the FormData 
 * @property part {ReadableStream} [stream] input stream to use for the bits
 * @property part {Buffer} [buffer] input buffer to use for the bits
 * @protected
 * 
 * @see http://www.w3.org/TR/html401/interact/forms.html#h-17.13.4.2
 * @see http://www.w3.org/Protocols/rfc1341/5_Content-Transfer-Encoding.html
 */
BdWebosBase.prototype.returnFormData = function(parts, res, next) {
	if (!Array.isArray(parts) || parts.length < 1) {
		setImmediate(next, new Error("Invalid parameters: cannot return a multipart/form-data of nothing"));
		return;
	}
	log.verbose("BdWebosBase#returnFormData()", parts.length, "parts");

	var combinedStream;
	try {
		// Build the multipart/formdata
		var FORM_DATA_LINE_BREAK = '\r\n',
		    boundary = _generateBoundary();
		var mode;

		combinedStream = CombinedStream.create({
			maxDataSize: this.config.maxDataSize || 15*1024*1024 /*15 MB*/
		});
		
		parts.forEach(function(part) {
			// Adding part header
			if (!part.name) {
				throw new HttpError(503, "Invalid (missing name) part:"+ util.inspect(part, {level: 2}));
			} else {
				combinedStream.append(_getPartHeader(part.name));
			}

			// Adding data
			if (part.path) {
				mode = "path";
				var stream = fs.createReadStream(part.path);
				stream.on('error', function(err) {
					log.warn("BdWebosBase#returnFormData()", "part:", part.name, "(" + mode + ")", "err:", err);
					next(err);
				});
				combinedStream.append(function(append) {
					append(stream.pipe(base64.encode()));
				});
			} else if (part.stream) {
				mode = "stream";
				part.stream.on('error', function(err) {
					log.warn("BdWebosBase#returnFormData()", "part:", part.name, "(" + mode + ")", "err:", err);
					next(err);
				});
				combinedStream.append(part.stream.pipe(base64.encode()));
			} else if (part.buffer) {
				mode = "buffer";
				combinedStream.append(function(append) {
					append(part.buffer.toString('base64'));
				});
			} else {
				log.warn("BdWebosBase#returnFormData()", "Invalid part:", part);
				throw new HttpError(503, "Invalid part:"+ util.inspect(part, {level: 2}));
			}
			log.silly("BdWebosBase#returnFormData()", "part:", part.name, "(" + mode + ")");
		
			// Adding part footer
			combinedStream.append(function(append) {
				log.silly("BdWebosBase#returnFormData()", "end-of-part:", part.name);
				append(_getPartFooter());
			});
		});
		
		// Adding last footer
		combinedStream.append(function(append) {
			append(_getLastPartFooter());
		});
	} catch(err) {
		setImmediate(next, err);
		return;
	}

	// Send the files back as a multipart/form-data
	res.status(200);
	res.header('Content-Type', _getContentTypeHeader());
	res.header('X-Content-Type', _getContentTypeHeader());
	combinedStream.on('error', next);
	combinedStream.on('end', function() {
		log.silly("BdWebosBase#returnFormData()", "Streaming completed");
		next();
	});
	combinedStream.pipe(res);
	
	function _generateBoundary() {
		// This generates a 50 character boundary similar to those used by Firefox.
		// They are optimized for boyer-moore parsing.
		var boundary = '--------------------------';
		for (var i = 0; i < 24; i++) {
			boundary += Math.floor(Math.random() * 10).toString(16);
		}

		return boundary;
	}

	function _getContentTypeHeader() {
		return 'multipart/form-data; boundary=' + boundary;
	}

	function _getPartHeader(filename) {
		var header = '--' + boundary + FORM_DATA_LINE_BREAK;
		header += 'Content-Disposition: form-data; name="file"';

		header += '; filename="' + filename + '"' + FORM_DATA_LINE_BREAK;

		// 'Content-Transfer-Encoding: base64' require
		// 76-columns data, to not break
		// `connect.bodyParser()`... so we use our own
		// `BdWebosBase.bodyParser()`.
		header += 'Content-Type: application/octet-stream' + FORM_DATA_LINE_BREAK;
		header += 'Content-Transfer-Encoding: base64' + FORM_DATA_LINE_BREAK;

		header += FORM_DATA_LINE_BREAK;
		return header;
	}

	function _getPartFooter() {
		return FORM_DATA_LINE_BREAK;
	}

	function _getLastPartFooter() {
		return '--' + boundary + '--';
	}
};

BdWebosBase.prototype.bodyParser = function(req, res, next) {
	if (req.is("application/json")) {
		this.receiveJson(req, res, next);
	} else if (req.is("application/x-www-form-urlencoded")) {
		this.receiveWebForm(req, res, next);
	} else {
		setImmediate(next);
	}
};

BdWebosBase.prototype.receiveJson = function(req, res, next) {
	var buf = '';
	req.setEncoding('utf8');
	req.on('data', function(chunk){
		buf += chunk;
	});
	req.on('end', function(){
		if (0 === buf.length) {
			return next(new HttpError(400, "Invalid JSON, empty body"));
		}
		try {
			req.body = JSON.parse(buf);
		} catch (err){
			return next(new HttpError(400, "Invalid JSON: " + err.toString()));
		}
		next();
	});
};

/**
 * Parse the multipart/form-data in the incoming request
 * @param {http.Request} req
 * @param {Function} receiveFile
 * @param receiveFile {String} name might be "file" or the actual part file name
 * @param receiveFile {stream.Readable} file
 * @param receiveFile {Function} next commonJS callback, to be called when the file was read completelly
 * @param receiveFile {String} [filename] the actual part file name, when present
 * @param {Function} receiveField
 * @param receiveField {String} fieldname
 * @param receiveField {String} fieldvalue
 * @param {Function} next commonJS callback
 * @param next {Error} err falsy in case of success
 * @param next {Integer} nfiles number of files received
 * @param next {Integer} nfields number of fields set in {req.body}
 */
BdWebosBase.prototype.receiveFormData = function(req, receiveFile, receiveField, next) {
	log.verbose("BdWebosBase#receiveFormData()");
	var infiles = 0, outfiles = 0, nfields = 0;
	var parsed = false;
	var busboy = new Busboy({headers: req.headers});
	busboy.on('file', function(fieldName, fieldValue, fileName, encoding) {
		infiles++;
		log.silly("BdWebosBase#receiveFormData()", "fieldName:", fieldName, ", fileName:", fileName, "encoding:", encoding);
		var file = new Readable().wrap(fieldValue);
		receiveFile(fieldName, file, _receivedPart, fileName, encoding);
	});
	busboy.on('field', function(fieldname, val, valTruncated, keyTruncated) {
		++nfields;
		log.silly("BdWebosBase#receiveFormData()", "field", fieldname, "=", val);
		receiveField(fieldname, val);
	});
	busboy.once('end', function() {
		log.silly("BdWebosBase#receiveFormData()", "parsing complete, infiles:", infiles);
		parsed = true;
		if (infiles === 0) {
			next();
		}
	});
	log.silly("BdWebosBase#receiveFormData()", "parsing started");
	req.on('error', function(err) {
		log.warn("BdWebosBase#receiveFormData()", "req.err:", err);
		next(err);
	});
	busboy.on('error', function(err) {
		log.warn("BdWebosBase#receiveFormData()", "busboy.err:", err);
		next(err);
	});
	req.pipe(busboy);

	function _receivedPart(err) {
		outfiles++;
		log.silly("BdWebosBase#receiveFormData_receivedPart()", outfiles + "/" + infiles + " file parts processed");
		if (parsed && infiles === outfiles) {
			log.verbose("BdWebosBase#receiveFormData#_receivedPart()", "received", outfiles, "parts");
			setImmediate(next, null, outfiles, nfields);
		}
	}
};

/**
 * Parse the application/x-www-form-urlencoded in the incoming request
 * @param {http.Request} req
 * @param {Function} receiveField
 * @param receiveField {String} fieldname
 * @param receiveField {String} fieldvalue
 * @param {Function} next commonJS callback
 */
BdWebosBase.prototype.receiveWebForm = function(req, res, next) {
	var nfields = 0;
	var busboy = new Busboy({headers: req.headers});
	req.body = req.body || {};
	busboy.on('field', function(fieldname, val, valTruncated, keyTruncated) {
		++nfields;
		log.silly("BdWebosBase#receiveWebForm()", "field", fieldname, "=", val);
		req.body[fieldname] = val;
	});
	busboy.once('end', function() {
		log.verbose("BdWebosBase#receiveWebForm()", "parsed " + nfields + " fields");
		next();
	});
	busboy.on('error', function(err) {
		log.warn("BdWebosBase#receiveWebForm()", "busboy.err:", err);
		next(err);
	});
	log.verbose("BdWebosBase#receiveWebForm()", "parsing started");
	req.pipe(busboy);
};

/**
 * Terminates express server & clean-up the plate
 * @protected
 */
BdWebosBase.prototype.quit = function(next) {
	log.info('BdWebosBase#quit()');
	this.server.close();
	if (this.config.performCleanup) {
		this.cleanProcess(next);
	} else {
		setImmediate(next);
	}
};

/**
 * @protected
 */
BdWebosBase.prototype.cleanProcess = function() {
	log.verbose('BdWebosBase#cleanProcess()');
};

/**
 * @protected
 */
BdWebosBase.prototype.onExit = function() {
	log.verbose('BdWebosBase#onExit()');
};
