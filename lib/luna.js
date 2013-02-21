
var npmlog = require('npmlog'),
    BufferStream = require('bufferstream'),
    novacom = require('./novacom');

(function() {

	var log = npmlog;
	log.heading = 'luna';
	log.level = 'warn';

	var luna = {
		/**
		 * send a command on a luna bus
		 * @param {Object} options
		 * @param options {novacom.Session} novacom
		 * @param {Object} addr
		 * @param addr {String} service luna service name
		 * @param addr {String} [folder] containing folder of the requested method
		 * @param addr {String} method the luna method to invoke
		 * @param {Object} param the unique luna parameter
		 * @param {Function} onResponse the callback invoked at each JSON object received from luna-send
		 * @param onResponse {Object} obj the JSON object received
		 * @param onResponse {Function} next a common-js callback
		 */
		send: function(options, addr, param, onResponse, next) {
			var session = options && options.session;
			// es is not parsed & kept to display the full error in case of failure
			// is is not parsed & not filled:  it is only used to transmit an EOF to terminate the remote luna-send
			// os is parsed to figure-out the success or failure of the command
			var os = new BufferStream({encoding:'utf8', size:'flexible'}),
			    es = new BufferStream({encoding:'utf8', size:'flexible'}),
			    is = new BufferStream({encoding:'utf8', size:'flexible'}),
			    result, status, url, mode;
			url = ['luna:/', addr.service, addr.folder, addr.method].join('/');
			if (options && options.nReplies) {
				mode = "-n " + options.nReplies + " ";
			} else {
				mode = "-i ";
			}
			session.run("/usr/bin/luna-send " + mode + url + " '" + JSON.stringify(param) + "'", is /*stdin*/, os /*stdout*/, es /*stderr*/, function(err) {
				if (err) {
					// es has buffered everything
					process.stderr.write(es.getBuffer());
					next(err);
					return;
				}
			});
			
			// split on CR+LF or LF.  No 'data' event is
			// issued until we provide splitter token(s).
			// Re-assemble the lines (without the LF) &
			// deliver their content as individual parsed
			// JSON objects.
			var jsonLine = "";
			os.split('\n', '\r\n');
			os.on('split', function(lineBuf) {
				jsonLine += lineBuf.toString();
				try {
					log.verbose('luna#send', 'JSON line:', jsonLine);
					result = JSON.parse(jsonLine);
					jsonLine = "";
					log.verbose('luna#send', 'JSON object:', result);
					if (result.returnValue === false) {
						// es has buffered everything
						process.stderr.write(es.getBuffer());
						is.end();
						next(new Error('luna-send command failed (' + result.errorText + ')'));
					} else {
						onResponse(result, function(err, value) {
							log.verbose('luna#send', "err:", err, "value", value);
							if (err) {
								// es has buffered everything
								process.stderr.write(es.getBuffer());
							}
							if (err || value) {
								log.verbose('luna#send', "closing exec stream");
								// processing completed or failed
								is.end();
								next(err, value);
							}
						});
					}
				} catch(e) {
					// ignore the parsing error:
					// the line may be incomplete
					// & not yet JSON-parseable
				}
			});
		}
	};
 
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = luna;
	}

}());

