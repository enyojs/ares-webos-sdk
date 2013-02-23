var stream = require("stream"),
    util = require("util");

(function() {

	function Eof(options) {
		stream.Stream.call(this);
	}

	util.inherits(Eof, stream.Stream);

	/*
	 * Readable stream interface
	 */
	Eof.prototype.pause = function() {
	};

	Eof.prototype.resume = function() {
	};

	Eof.prototype.destroy = function() {
		this.emit('end');
		this.emit('close');
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = Eof;
	}

}());
