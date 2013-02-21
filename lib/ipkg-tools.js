var prjpack = require('./packager'),
    prjgen = require('./generator');

(function () {

	var openwebos = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = openwebos;
	}

	var generator = new prjgen.Generator();

	/**
	 * registerTemplates allow to add new templates to the list
	 * of available templates
	 * @param {Array} newTemplates: array of local templates to add.
	 * Entries must have 'id', 'url' and 'description' properties.
	 * @public
	 */
	openwebos.registerTemplates = function(newTemplates) {
		generator.registerTemplates(newTemplates);
	};

	/**
	 * registerRemoteTemplates allows to fetch templates definition
	 * thru http
	 * @param  {string}   templatesUrl an http url referencing a json file
	 * which contains a array of entries a 'id', 'url' and 'description' properties.
	 * @param  {Function} callback(err, status)     commonjs callback. Will be invoked with an error
	 *               or a json array of generated filenames.
	 * @public
	 */
	openwebos.registerRemoteTemplates = function(templatesUrl, callback) {
		generator.registerRemoteTemplates(templatesUrl, callback);
	};

	openwebos.list = function(callback) {
		generator.list(callback);
	};

	openwebos.generate = function(templateId, substitutions, destination, options, callback) {
		generator.generate(templateId, substitutions, destination, options, callback);
	};

	openwebos.checkApp = function(inDirs, options, callback) {
		var packager = new prjpack.Packager(options);
		packager.checkInputDirectories(inDirs, options, callback);
	};

	openwebos.packageApp = function(inDirs, destination, options, callback) {
		var packager = new prjpack.Packager(options);
		packager.generatePackage(inDirs, destination, options, callback);
	};
}());
