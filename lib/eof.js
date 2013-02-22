var stream = require("stream"),
    npmlog = require('npmlog'),
    util = require("util");

(function() {

	var log = npmlog;
	log.heading = 'eof';
	log.level = 'verbose';

	function Eof(options) {
		log.verbose('eof', 'Eof(): options=', options);
		stream.Stream.call(this);
	}

	util.inherits(Eof, stream.Stream);

	/*
	 * Readable stream interface
	 */
	Eof.prototype.pause = function() {
		log.verbose('eof', 'pause():');
	};

	Eof.prototype.resume = function() {
		log.verbose('eof', 'resume():');
	};

	Eof.prototype.destroy = function() {
		log.verbose('eof', 'destroy():');
		this.emit('end');
		this.emit('close');
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = Eof;
	}

}());
