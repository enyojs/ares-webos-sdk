enyo.kind({
	name: "Webos.Build",
	kind: "enyo.Component",
	debug: false,
	events: {
		onShowWaitPopup: ""
	},
	published: {
		device: ""
	},
	/**
	 * @protected
	 */
	create: function() {
		this.inherited(arguments);
	},
	/**
	 * @public
	 */
	setConfig: function(config) {
		this.config = config;
		if (this.debug) this.log(config);

		if (this.config.origin && this.config.pathname) {
			this.url = this.config.origin + this.config.pathname;
			if (this.debug) this.log("url:", this.url);
		}
	},
	/**
	 * Shared enyo.Ajax error handler
	 * @private
	 */
	_handleServiceError: function(msg, next, inSender, inError) {
		var response = inSender.xhrResponse, contentType, details;
		if (response) {
			contentType = response.headers['content-type'];
			if (contentType && contentType.match('^text/plain')) {
				details = response.body;
			}
		}
		next(new Error(msg + inError.toString()), details);
	},
	/**
	 * Build an Open webOS application package
	 * @param {Ares.Model.Project} project
	 * @param {Function} next is a CommonJS callback
	 * @public
	 */
	build: function(project, next) {
		if (this.debug) { this.log("Starting webOS build: " + this.url + '/build'); }
		async.waterfall([
			this._getFilesData.bind(this, project),
			this._submitBuildRequest.bind(this, project),
			this._prepareStore.bind(this, project),
			this._storePkg.bind(this, project)
		], next);
	},
	/**
	 * Get the list of files of the project for further upload
	 * @param {Object} project
	 * @param {Function} next is a CommonJS callback
	 * @private
	 */
	_getFilesData: function(project, next) {
		if (this.debug) this.log("...");
		var req, fileList = [];
		this.doShowWaitPopup({msg: $L("Fetching webOS application source code")});
		req = project.getService().exportAs(project.getFolderId(), -1 /*infinity*/);
		req.response(this, function(inSender, inData) {
			if (this.debug) this.log("Got the files data");
			var ctype = req.xhrResponse.headers['x-content-type'];
			next(null, {content: inData, ctype: ctype});
		});
		req.error(this, this._handleServiceError.bind(this, "Unable to fetch application source code", next));
	},
	/**
	 * @private
	 * @param {Object} project
	 * @param {FormData} formData
	 * @param {Function} next is a CommonJS callback
	 */
	_submitBuildRequest: function(project, formData, next) {
		if (this.debug) this.log(formData.ctype);

		this.doShowWaitPopup({msg: $L("Building webOS application package")});
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
			next(null, {content: inData, ctype: ctype});
		});
		req.error(this, this._handleServiceError.bind(this, "Unable to build application", next));
		req.go();
	},
	/**
	 * Prepare the folder where to store the built package
	 * @private
	 */
	_prepareStore: function(project, inData, next) {
		this.doShowWaitPopup({msg: $L("Storing webOS application package")});
		var folderId = project.getObject("build.openwebos.target.folderId");
		if (folderId) {
			next(null, folderId, inData);
		} else {
			var req = project.getService().createFolder(project.getFolderId(), "target/" + Webos.Build.serviceName);
			req.response(this, function(inSender, inResponse) {
				if (this.debug) this.log("response received ", inResponse);
				folderId = inResponse.id;
				project.setObject("build.openwebos.target.folderId", folderId);
				next(null, folderId, inData);
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to prepare ipk storage", next));
		}
	},
	/**
	 * @private
	 */
	_storePkg: function(project, folderId, inData, next) {
		if (this.debug) this.log("ctype: ", inData.ctype, " bytes: " + inData.content.length);

		this.doShowWaitPopup({msg: $L("Storing webOS application package")});
		var req = project.getService().createFiles(folderId, {content: inData.content, ctype: inData.ctype});
		req.response(this, function(inSender, inData) {
			if (this.debug) this.log("response received ", inData);
			var config = project.getService().config;
			var pkgUrl = config.origin + config.pathname + '/file' + inData[0].path; // TODO: YDM: shortcut to be refined
			project.setObject("build.openwebos.target.pkgUrl", pkgUrl);
			next();
		});
		req.error(this, this._handleServiceError.bind(this, "Unable to store pkg", next));
	},
	/**
	 * @public
	 */
	install: function(project, next) {
		var pkgUrl = project.getObject("build.openwebos.target.pkgUrl");
		if (this.debug) this.log('installing:', pkgUrl);
		if (!pkgUrl) {
			next(new Error("No application package: you need to build the application first"));
			return;
		}
		async.waterfall([
			this._installPkg.bind(this, project, pkgUrl)
		], next);
	},
	/**
	 * @private
	 */
	_installPkg: function(project, pkgUrl, next) {
		this.doShowWaitPopup({msg: $L("Installing webOS package")});

		var data = {
			package : pkgUrl,
			device: this.device || "default"
		}; 
		var req = new enyo.Ajax({
			url: this.url + '/op/install',
			method: 'POST',
			handleAs: 'text',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			this.log("inData:", inData);
			next();
		});
		req.error(this, function(inSender, inError) {
			var response = inSender.xhrResponse, contentType, details;
			if (response) {
				contentType = response.headers['content-type'];
				if (contentType && contentType.match('^text/plain')) {
					details = response.body;
				}
			}
			next(new Error("Unable to install application:" + inError), details);
		});
		req.go();
	},
	/**
	 * @public
	 */
	run: function(project, next) {
		if (this.debug) this.log('launching');
		async.waterfall([
			this._getAppInfo.bind(this, project),
			this._getAppId.bind(this, project),
			this._runApp.bind(this, project)
		], next);
	},
	/**
	 * @private
	 */
	_getAppInfo: function(project, next) {
		var appId = project.getObject("test.openwebos.appId");
		if (appId) {
			next(null, appId, {});
		} else {
			var req = project.getService().propfind(project.getFolderId(), 1);
			req.response(this, function(inRequest, inData) {
				this.log("getAppInfo#inData:", inData);
				var appInfoFile = enyo.filter(inData.children, function(child) {
					return child.name === 'appinfo.json';
				}, this)[0];
				next(null, appId, appInfoFile);
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project root folder", next));
			req.go();
		}
	},
	/**
	 * @private
	 */
	_getAppId: function(project, appId, appInfoFile, next) {
		if (appId) {
			next(null, appId);
		} else {
			var req = project.getService().getFile(appInfoFile.id);
			req.response(this, function(inRequest, inData) {
				try {
					this.log("getAppId#inData:", inData);
					var appInfo;
					appInfo = JSON.parse(inData.content);
					appId = appInfo.id;
					project.setObject("test.openwebos.appId", appId);
					next(null, appId);
				} catch(err) {
					next(err);
				}
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project root folder", next));
			req.go();
		}
	},
	/**
	 * @private
	 */
	_runApp: function(project, appId, next) {
		if (this.debug) this.log('launching ' + appId);
		this.doShowWaitPopup({msg: $L("Launching application:" + appId)});
		if (!appId) {
			next(new Error("Did not find application id in appinfo"));
			return;
		}
		var data = {
			id: encodeURIComponent(appId),
			device: this.device || "default"
		};
		var req = new enyo.Ajax({
			url: this.url + '/op/launch',
			method: 'POST',
			handleAs: 'json',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			this.log("runApp#inData:", inData);
			next();
		});
		req.error(this, function(inSender, inError) {
			var response = inSender.xhrResponse, contentType, details;
			if (response) {
				contentType = response.headers['content-type'];
				if (contentType && contentType.match('^text/plain')) {
					details = response.body;
				}
			}
			next(new Error("Unable to launch application:" + inError), details);
		});
		req.go();
	},
	/**
	 * @public
	 */
	runDebug: function(project, next) {
		next(new Error("debug: not implemented"));
	},

	/**
	 * @return the human-friendly name of this service
	 */
	getName: function() {
		return "WebOS";
	},

	/**
	 * Name of the kind to show in the {ProjectProperties} UI
	 * @return the Enyo kind to use to set Phonegap project properties
	 */
	getAresPropertiesKind: function() {
		return "WebOS.AresProperties";
	},

	statics: {
		serviceName: "webos"
	}
});

// Provide to ServiceRegistry the information to instanciate the service client implemtation
ServiceRegistry.instance.pluginReady(Webos.Build.serviceName, {kind: "Webos.Build"});
