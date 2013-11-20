var prjpack = require('./packager'),
    launcher = require('./launcher'),
    inspector = require('./inspector'),
    installer = require('./installer'),
    gdbserver = require('./gdbserver');

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

	/**
	 * @see './inspector.js'
	 * @public
	 */
	openwebos.inspector = inspector;

	/**
	 * @see './gdbserver.js'
	 * @public
	 */
	openwebos.gdbserver = gdbserver;
}());
