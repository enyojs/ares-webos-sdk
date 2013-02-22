
var npmlog = require('npmlog'),
    Eof = require("./eof"),
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
			// 'is' is used to transmit an EOF to
			// terminate the remote luna-send.  this is
			// the only way to terminate an interactive
			// request 'luna-send -i'...
			var is = new Eof(),
			    result, status, url, mode;
			is.pause();
			url = ['luna:/', addr.service, addr.folder, addr.method].join('/');
			if (options && options.nReplies) {
				mode = "-n " + options.nReplies + " ";
			} else {
				mode = "-i ";
			}
			session.run("/usr/bin/luna-send " + mode + url + " '" + JSON.stringify(param) + "'", is /*stdin*/, _onData, process.stderr, function(err) {
				if (err) {
					next(err);
				}
				// success when the output of the
				// command is correctly interpreted,
				// not simply when the command exit
				// with a success exit code.
			});
			
			var jsonLine = "";

			// Break string into lines (JSON.parse needs a
			// single object per call).
			function _onData(data) {
				var str;
				if (Buffer.isBuffer(data)) {
					str = data.toString();
				} else {
					 str = data;
				}
				str.split(/\r?\n/).forEach(_onLine);
			}

			function _onLine(line) {
				jsonLine += line;
				try {
					log.verbose('luna#send', 'JSON line:', jsonLine);
					result = JSON.parse(jsonLine);
					jsonLine = "";
					log.verbose('luna#send', 'JSON object:', result);
					if (result.returnValue === false) {
						is.destroy();
						next(new Error('luna-send command failed (' + result.errorText + ')'));
					} else {
						onResponse(result, function(err, value) {
							log.verbose('luna#send', "err:", err, "value", value);
							if (err || value) {
								log.verbose('luna#send', "closing exec stream");
								// processing completed or failed
								is.destroy();
								next(err, value);
							}
						});
					}
				} catch(e) {
					// ignore the parsing error:
					// the line may be incomplete
					// & not yet JSON-parseable
				}
			}
		}
	};
 
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = luna;
	}

}());

