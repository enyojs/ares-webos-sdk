enyo.kind({
	name: "OpenWebosBuild",
	kind: "enyo.Component",
	debug: false,
	events: {
		onShowWaitPopup: ""
	},
	create: function() {
		this.inherited(arguments);
	},
	setConfig: function(config) {
		this.config = config;
		this.log(config);

		if (this.config.origin && this.config.pathname) {
			this.url = this.config.origin + this.config.pathname;
			if (this.debug) this.log("url:", this.url);
		}

		// Get the 'generate' service url
		var genSrv = ServiceRegistry.instance.resolveServiceId('prj-toolkit');
		if (genSrv) {
			this.genSrvUrl = genSrv.url;

			// Populate the repositories on nodejs
			enyo.forEach(config['project-template-repositories'], function(repository) {
				this.createRepo(repository);		// TODO: handle the answer
			}, this);
		}
	},
	createRepo: function(repo) {
		if (this.debug) this.log();
		var data = "url=" + encodeURIComponent(repo.url);
		var req = new enyo.Ajax({
			url: this.genSrvUrl + '/template-repos/' + repo.id,
			method: 'POST',
			postBody: data
		});
		return req.go();
	},
	build: function(project, next) {
		if (this.debug) { this.log("Starting OWO build: " + this.url + '/build'); }

		// TODO: move to async
		this.project = project;		// TODO: must go into a context object per build request

		this.getFilesData(project, next);
	},
	/**
	 * Get the list of files of the project for further upload
	 * @param {Object} project
	 * @param {Function} next is a CommonJS callback
	 * @private
	 */
	getFilesData: function(project, next) {
		if (this.debug) this.log("...");

		var req, fileList = [];
		req = project.filesystem.exportAs(project.folderId, -1 /*infinity*/);
		req.response(this, function(inEvent, inData) {
			this.doShowWaitPopup({msg: $L("Building webOS package")});
			if (this.debug) this.log("Got the files data");
			var ctype = req.xhrResponse.headers['x-content-type'];
			this.submitBuildRequest({content: inData, ctype: ctype}, next);
		});
		req.error(this, function(inEvent, inError) {
			next(new Error("Unable to get project file list: " + inError));
		});
	},
	/**
	 * @private
	 * @param {Object} project
	 * @param {FormData} formData
	 * @param {Function} next is a CommonJS callback
	 */
	submitBuildRequest: function(formData, next) {
		if (this.debug) this.log(formData.ctype);

		// Ask Hermes PhoneGap Build service to minify and zip the project
		var req = new enyo.Ajax({
			url: this.url + '/op/build',
			method: 'POST',
			handleAs: 'text',
			postBody: formData.content,
			contentType: formData.ctype
		});
		req.response(this, function(inSender, inData) {
			if (this.debug) this.log("response: received " + inData.length + " bytes typeof: " + (typeof inData));
			var ctype = req.xhrResponse.headers['content-type'];
			if (this.debug) this.log("response: received ctype: " + ctype);
			this.storeIpk({content: inData, ctype: ctype}, next);
		});
		req.error(this, function(inSender, inError) {
			var response = inSender.xhrResponse, contentType, details;
			if (response) {
				contentType = response.headers['content-type'];
				if (contentType && contentType.match('^text/plain')) {
					details = response.body;
				}
			}
			next(new Error("Unable to build application:" + inError), details);
		});
		req.go();
	},
	storeIpk: function(inData, next) {
		if (this.debug) this.log("ctype: ", inData.ctype, " bytes: " + inData.content.length);

		var req = this.project.filesystem.createFiles(this.project.folderId, {content: inData.content, ctype: inData.ctype});
		req.response(this, function(inSender, inData) {
			if (this.debug) this.log("response received ", inData);
			var config = this.project.filesystem.config;
			var url = config.origin + config.pathname + '/file' + inData[0].path;			// TODO: YDM: shortcut to be refined

			this.install(url, next);
		});
		req.error(this, function(inSender, inError) {
			next(new Error("Unable to store ipk: " + inError));
		});
	},
	install: function(packageUrl, next) {
		if (this.debug) this.log('installing ' + packageUrl);
		this.doShowWaitPopup({msg: $L("Installing webOS package")});

		var data = "package=" + encodeURIComponent(packageUrl);
		var req = new enyo.Ajax({
			url: this.url + '/op/install',
			method: 'POST',
			handleAs: 'text',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			var config = this.project.config;					// TODO: app id must come from appinfo.json
			this.launch(config.data.id, next);
		});
		req.error(this, function(inSender, inError) {
			next("Unable to install application:");
		});
		req.go();
	},
	launch: function(id, next) {
		if (this.debug) this.log('launching ' + id);
		this.doShowWaitPopup({msg: $L("Starting webOS application")});

		var data = "id=" + encodeURIComponent(id);
		var req = new enyo.Ajax({
			url: this.url + '/op/launch',
			method: 'POST',
			handleAs: 'text',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			next();
		});
		req.error(this, function(inSender, inError) {
			next("Unable to launch application:");
		});
		req.go();
	}
});

var builder = new OpenWebosBuild();
ServiceRegistry.instance.pluginReady("openwebos", builder);