/*jshint node: true, strict: false, globalstrict: false */

var sprintf = require('sprintf').sprintf;

(function () {

	var helpFormat = {};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = helpFormat;
	}

	helpFormat.format =  function(msg) {
		var helpString = "";
		for(idx in arguments) {
			helpString = helpString.concat(sprintf('\t%-45s', arguments[idx]));
		}
		return helpString;
	};
}());
