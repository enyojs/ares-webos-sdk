enyo.kind({
	name: "Webos.Build",
	kind: "enyo.Component",
	debug: false,
	events: {
		onShowWaitPopup: "",
		onError: ""
	},
	published: {
		device: "emulator"
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
	 * @return {Object} the configuration this service was configured by
	 */
	getConfig: function() {
		return this.config;
	},

	/**
	 * @return the human-friendly name of this service
	 */
	getName: function() {
		return this.config.name || this.config.id;
	},

	/**
	 * Default configuration used when a new project is created.
	 * @public
	 */
	getDefaultProjectConfig: function() {
		return ares.clone(Webos.Build.DEFAULT_PROJECT_CONFIG);
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
	loadDevicesList:function(next){
		var req = new enyo.Ajax({
			url: this.url + '/devices/load',
			method: 'POST',
			handleAs: 'text',
			postBody: 'devicesload'
		});
		
		req.response(this, function(inSender, inData) {
			next(inData);
		});
		
		req.error(this, this._handleServiceError.bind(this, "Failed to load Devices list", next));
		req.go();
	},
	saveDevicesList:function(devicesList, next){
		if (this.debug) { this.log("saving webOS Devices List: " + this.url + '/load'); }
	
		var devices = [];
	
		for(var i in devicesList){
			devices.push(enyo.json.stringify(devicesList[i]));
		}
		
		var req = new enyo.Ajax({
			url: this.url + '/devices/save',
			method: 'POST',
			handleAs: 'json',
			postBody: devices
		});
		
		req.response(this, function(inSender, inData) {
			next(inData);
		});
		
		req.error(this, this._handleServiceError.bind(this, "Failed to save Devices list", next));
		req.go();	
	},
	requestPrivateKey:function(deviceName, next){
		if (this.debug) { this.log("requestPrivateKey"); }
	
		var req = new enyo.Ajax({
			url: this.url + '/devices/requestKey',
			method: 'POST',
			handleAs: 'json',
			postBody: deviceName
		});
		
		req.response(this, function(inSender, inData) {
			next(inData);
		});
		
		req.error(this, this._handleServiceError.bind(this, "Failed to save Devices list", next));
		req.go();	
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
	    	this._checkAppInfo.bind(this, project, next),
	    	this._getFilesData.bind(this, project),
	    	this._submitBuildRequest.bind(this, "build", project),
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
	_submitBuildRequest: function(actionmode, project, formData, next) {
		if (this.debug) this.log(formData.ctype);
		var minify = true;
		
		if (actionmode === 'debug'){
			minify = false;
		}

		var mode = {
			minifymode : minify
		};

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
		req.go(mode);
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
			this._checkAppInfo.bind(this, project, next),
			this._getAppInfo.bind(this, project),
			this._getAppId.bind(this, project),
			this._installPkg.bind(this, project, pkgUrl)
		], next);
	},
	/**
	 * @private
	 */
	_installPkg: function(project, pkgUrl, appId, next) {
		this.doShowWaitPopup({msg: $L("Installing webOS package")});
		pkgUrl = pkgUrl || project.getObject("build.openwebos.target.pkgUrl");
		var data = {
			package : pkgUrl,
			appId	: appId,
			device	: this.device
		}; 
		var req = new enyo.Ajax({
			url: this.url + '/op/install',
			method: 'POST',
			handleAs: 'json',
			postBody: data,
			timeout: 300000
		});

		req.response(this, function(inSender, inData) {
			this.log("inData:", inData);
			next(null, appId, null);
		});
		req.error(this, function(inSender, inError) {
			var response = inSender.xhrResponse, contentType, details;
			if (response) {
				contentType = response.headers['content-type'];
				if (contentType && contentType.match('^text/plain')) {
					details = response.body;
				}
			}
			next(new Error("Unable to install application(" + inError +"): "+ details.replace(/^Error:/,"")));
		});
		req.go();
	},
	/**
	 * @public
	 */
	run: function(project, next) {
		if (this.debug) this.log('launching');
		var installMode = project.attributes.config.data.providers.webos.installMode || "Installed";
		if(installMode === "Hosted"){
			async.waterfall([
				this._getAppDir.bind(this, project),
				this._runApp.bind(this, project, "com.sdk.ares.hostedapp")
			], next);
		} else {
		    async.waterfall([
		    	this._checkAppInfo.bind(this, project, next),
		    	//Build
				this._getFilesData.bind(this, project),
				this._submitBuildRequest.bind(this, "run", project),
				this._prepareStore.bind(this, project),
				this._storePkg.bind(this, project),
				//Install
				this._getAppInfo.bind(this, project),
				this._getAppId.bind(this, project),
				this._installPkg.bind(this, project, null),
				//Run
				this._runApp.bind(this, project)

		    ], next);
		}
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
	
	_getAppDir: function(project, next) {
		var appDir;
		var req = project.getService().propfind(project.getFolderId(), 1);
			req.response(this, function(inRequest, inData) {
				this.log("_getAppDir#inData:", inData);
				next(null, inData);
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project service folder", next));
			req.go();
	},

	/**
	 * @private
	 */
	_getServicesDir: function(project, next) {
		var servicesDir;
		var req = project.getService().propfind(project.getFolderId(), 1);
			req.response(this, function(inRequest, inData) {
				this.log("_getServicesDir#inData:", inData);
				var servicesDir = enyo.filter(inData.children, function(child) {
					return child.name === 'services';
				}, this)[0];
				next(null, servicesDir);
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project service folder", next));
			req.go();
	},
	/**
	 * @private
	 */
	_getServiceDirs: function(project, servicesDir, next) {
		if (!servicesDir) {
			next(null, null);
		} else {
			var req = project.getService().propfind(servicesDir.id, 1);
				req.response(this, function(inRequest, inData) {
					this.log("_getServiceDirs#inData:", inData);
					var serviceDirs = enyo.filter(inData.children, function(child) {
						return child.isDir === true;
					}, this);
					next(null, serviceDirs);
				});
				req.error(this, this._handleServiceError.bind(this, "Unable to list project service folder", next));
				req.go();
		}
	},

	/**
	 * @private
	 */
	_getServiceInfoFiles: function(project, serviceDirs, next) {
		var serviceInfoFiles = [];
		if (!serviceDirs) {
			next(null, null);
		} else {
			async.series([
				async.forEachSeries.bind(this, serviceDirs, __getServiceInfoFiles.bind(this))
			], function(err) {
				if (err) {
					next(err);
				}
				next(null, serviceInfoFiles);
			});
		}

		function __getServiceInfoFiles(serviceInfoDir, next) {
			var req = project.getService().propfind(serviceInfoDir.id, 1);
			req.response(this, function(inRequest, inData) {
				this.log("_getServiceInfoFiles#__getServiceInfoFiles#inData:", inData);
				var serviceInfoFile = enyo.filter(inData.children, function(child) {
					return child.name === 'services.json';
				}, this)[0];
				serviceInfoFiles.push(serviceInfoFile);
				next();
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project service folder", next));
			req.go();
		}
	},
	/**
	 * @private
	 */
	_getServiceIds: function(project, serviceInfoFiles, next) {
		var serviceIds = [];
		if (!serviceInfoFiles) {
			next(null, serviceIds);
		} else {
			async.series([
				async.forEachSeries.bind(this, serviceInfoFiles, __getServiceInfoFile.bind(this))
			], function(err) {
				if (err) {
					next(err);
				}
				next(null, serviceIds);
			});
		}

		function __getServiceInfoFile(serviceInfoFile, next) {
			var req = project.getService().getFile(serviceInfoFile.id);
			req.response(this, function(inRequest, inData) {
				try {
					this.log("_getServiceIds#__getServiceInfoFile#inData:", inData);
					var serviceInfo, serviceId;
					serviceInfo = JSON.parse(inData.content);
					serviceId = serviceInfo.id;
					serviceIds.push(serviceId);
					next();
				} catch(err) {
					next(err);
				}
			});
			req.error(this, this._handleServiceError.bind(this, "Unable to list project service folder", next));
			req.go();
		}
	},
	/**
	 * @private
	 */
	_runApp: function(project, appId, appData, next) {
		if (this.debug) this.log('launching ' + appId);
		this.doShowWaitPopup({msg: $L("Launching application:" + appId)});
		if (!appId) {
			next(new Error("Did not find application id in appinfo"));
			return;
		}
		var installMode = project.attributes.config.data.providers.webos.installMode || "Installed";
		var hostedurl = (appData) ? appData.path : "";
		var data = {
			id: encodeURIComponent(appId),
			device: this.device,
			installMode: installMode,
			hostedurl: hostedurl
		};
		
		var req = new enyo.Ajax({
			url: this.url + '/op/launch',
			method: 'POST',
			handleAs: 'json',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			this.log("runApp#inData:", inData);
			next(null, appId);
		});
		req.error(this, function(inSender, inError) {
			var response = inSender.xhrResponse, contentType, details;
			if (response) {
				contentType = response.headers['content-type'];
				if (contentType && contentType.match('^text/plain')) {
					details = response.body;
				}
			}
			next(new Error("Unable to launch application(" + inError +"): "+ details.replace(/^Error:/,"")));
		});
		req.go();
	},
	/**
	 * @public
	 */
	runDebug: function(project, next) {
		if (this.debug) this.log('launching');
		var installMode = project.attributes.config.data.providers.webos.installMode || "Installed";
		if(installMode === "Hosted"){
			async.waterfall([
				this._getAppDir.bind(this, project),
				this._runApp.bind(this, project, "com.sdk.ares.hostedapp"),
				this._debugApp.bind(this, project),
				this.debugService.bind(this, project)
			], next);
		} else {
		    async.waterfall([
		    	this._checkAppInfo.bind(this, project, next),
				//Build
				this._getFilesData.bind(this, project),
				this._submitBuildRequest.bind(this, "debug", project),
				this._prepareStore.bind(this, project),
				this._storePkg.bind(this, project),
				//Install
				this._getAppInfo.bind(this, project),
				this._getAppId.bind(this, project),
				this._installPkg.bind(this, project, null),
				//Run
				this._runApp.bind(this, project),
				//Debug
				this._debugApp.bind(this, project),
				this.debugService.bind(this, project)

		    ], next);
		}
	},

	_debugApp: function(project, appId, next) {
		if (this.debug) this.log('debugging ' + appId);
		this.doShowWaitPopup({msg: $L("debugging application:" + appId)});
		if (!appId) {
			next(new Error("Did not find application id in appinfo"));
			return;
		}
		var installMode = project.attributes.config.data.providers.webos.installMode || "Installed";
		var data = {
			appId: encodeURIComponent(appId),
			device: this.device,
			installMode: installMode
		};
		var req = new enyo.Ajax({
			url: this.url + '/op/debug',
			method: 'POST',
			handleAs: 'json',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			this.log("runDebug#inData:", inData);
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
			next(new Error("Unable to debug application(" + inError +"): "+ details.replace(/^Error:/,"")));
		});
		req.go();
	},

	debugService: function(project, next) {
		if (this.debug) this.log('debugService');
		async.waterfall([
			this._getServicesDir.bind(this, project),
			this._getServiceDirs.bind(this, project),
			this._getServiceInfoFiles.bind(this, project),
			this._getServiceIds.bind(this, project),
			this._debugService.bind(this, project)
		], next);
	},
	
	_debugService: function(project, serviceIds, next) {
		if (this.debug) this.log('debugging ' + serviceIds);
		if (serviceIds.length === 0) {
			this.log("Did not find service id in selected project");
			next();
			return;
		}
		this.doShowWaitPopup({msg: $L("debugging service:" + serviceIds)});
		var data = {
			serviceId: encodeURIComponent(serviceIds),
			device: this.device
		};
		var req = new enyo.Ajax({
			url: this.url + '/op/debug',
			method: 'POST',
			handleAs: 'json',
			postBody: data
		});
		req.response(this, function(inSender, inData) {
			this.log("runDebug#inData:", inData);
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
			next(new Error("Unable to debug service(" + inError +"): "+ details.replace(/^Error:/,"")));
		});
		req.go();
	},

	_checkAppInfo: function(project, outNext , next) {
		if (!next && typeof outNext === 'function') {
			next = outNext;
		}
		var req = project.getService().propfind(project.getFolderId(), 1);
		 req.response(this, function(inRequest, inData) {			
			var appInfoFiles = enyo.filter(inData.children, function(child) {
				return child.name === 'appinfo.json';
			}, this);
				
			if(appInfoFiles.length === 0){
				this.doError({msg:"There is not appinfo.json file in the " + inData.name + " project folder." , title:"User Error"});
				 outNext();
				return;
			} else {
				next();
			}
		});		
	},

	/**
	 * @return the human-friendly name of this service
	 */
	getName: function() {
		return "WebOS";
	},

	/**
	 * Name of the kind to show in the {ProjectProperties} UI
	 * @return the Enyo kind to use to set WebOS project properties
	 */
	getAresPropertiesKind: function() {
		return "WebOS.AresProperties";
	},

	/**
	 * Name of the kind to show in the {ProjectProperties} UI
	 * @return the Enyo kind to use to set service-specific project properties
	 * @public
	 */
	getProjectPropertiesKind: function() {
		return "WebOS.ProjectProperties";
	},

	statics: {
		serviceName: "webos",
		DEFAULT_PROJECT_CONFIG: {
			enabled: true
		}		
	}
});

// Provide to ServiceRegistry the information to instanciate the service client implemtation
ServiceRegistry.instance.pluginReady(Webos.Build.serviceName, {kind: "Webos.Build"});

