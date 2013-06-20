var prjpack = require('./packager'),
    launcher = require('./launcher'),
    installer = require('./installer');

(function () {

	var openwebos = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = openwebos;
	}

	openwebos.checkApp = function(inDirs, options, callback) {
		var packager = new prjpack.Packager(options);
		packager.checkInputDirectories(inDirs, options, callback);
	};

	openwebos.packageApp = function(inDirs, destination, options, callback) {
		var packager = new prjpack.Packager(options);
		packager.generatePackage(inDirs, destination, options, callback);
	};

	/**
	 * @see './installer.js'
	 * @public
	 */
	openwebos.installer = installer;

	/**
	 * @see './launcher.js'
	 * @public
	 */
	openwebos.launcher = launcher;
}());
