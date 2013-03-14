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

		this.getFileList(project, next);
	},
	/**
	 * Get the list of files of the project for further upload
	 * @param {Object} project
	 * @param {Function} next is a CommonJS callback
	 * @private
	 */
	getFileList: function(project, next) {
		if (this.debug) this.log("...");

		var req, fileList = [];
		req = project.filesystem.propfind(project.folderId, -1 /*infinity*/);
		req.response(this, function(inEvent, inData) {
			this.doShowWaitPopup({msg: $L("Building webOS package")});
			if (this.debug) enyo.log("Got the list of files", inData);
			// Extract the list into an array
			this.buildFileList(inData.children, fileList);
			var prefix = inData.path;
			var prefixLen = prefix.length + 1;
			this.prepareFileList(project, prefix, fileList, 0, prefixLen, next);
		});
		req.error(this, function(inEvent, inError) {
			next(new Error("Unable to get project file list: " + inError));
		});
	},
	buildFileList: function(inData, fileList) {
		var item;
		for(item in inData) {
			this.listAllFiles(inData[item], fileList);
		}
	},
	listAllFiles: function(inData, fileList) {
		if (inData.isDir) {
			for(var item in inData.children) {
				this.listAllFiles(inData.children[item], fileList);
			}
		} else {
			var obj = {path: inData.path, id: inData.id};
			fileList.push(obj);
		}
	},
	extractPrefixLen: function(inData) {
		var item = inData[0];
		return item.path.length - item.name.length;
	},
	prepareFileList: function(project, prefix, fileList, index, prefixLen, next) {
		// Start downloading files and building the FormData
		var formData = new enyo.FormData();
		var blob = new enyo.Blob([project.config.getPhoneGapConfigXml() || ""],
					 {type: "application/octet-stream"});
		formData.append('file', blob, 'config.xml');
		// hard-wire config.xml for now. may extend in the future (if needed)
		var drop = [prefix, "config.xml"].join('/');
		var newFileList = enyo.filter(fileList, function(file) {			// TODO: needed ?
			return file.path !== drop;
		}, this);
		if (this.debug) this.log("dropped: fileList.length:", fileList.length, "=> newFileList.length:", newFileList.length);

		this.downloadFiles(project, formData, newFileList, 0, prefixLen, next);
	},
	/**
	 * Download all the project files and add them into the multipart/form-data
	 * @param project
	 * @param {FormData} formData
	 * @param fileList
	 * @param index
	 * @param prefixLen
	 * @param {Function} next a CommonJS callback
	 */
	downloadFiles: function(project, formData, fileList, index, prefixLen, next) {
		// Still some files to download. Get one.
		var id = fileList[index].id;
		var name = fileList[index].path.substr(prefixLen);
		if (this.debug) this.log("Fetching " + name + " " + index + "/" + fileList.length);
		var request = project.filesystem.getFile(id);
		request.response(this, function(inEvent, inData) {
			// Got a file content: add it to the multipart/form-data
			if (this.debug) this.log("Fetched " + name + " size: " + inData.content.length + " bytes");
			var blob = new enyo.Blob([inData.content || ""], {type: "application/octet-stream"});
			// 'file' is the form field name, mutually agreed with the Hermes server
			formData.append('file', blob, name);

			if (++index >= fileList.length) {
				// No more file to download: submit the build request
				this.submitBuildRequest(project, formData, next);
			} else {
				// Get the next file (will submit the build if no more file to get)
				this.downloadFiles(project, formData, fileList, index, prefixLen, next);
			}
		});
		request.error(this, function(inEvent, inData) {
			this.log("ERROR while downloading files:", inData);
			next(new Error("Unable to download project files"));
		});
	},
	/**
	 * @private
	 * @param {Object} project
	 * @param {FormData} formData
	 * @param {Function} next is a CommonJS callback
	 */
	submitBuildRequest: function(project, formData, next) {
		if (this.debug) this.log("...");

		// Ask Hermes PhoneGap Build service to minify and zip the project
		var req = new enyo.Ajax({
			url: this.url + '/op/build',
			method: 'POST',
			handleAs: 'text',
			postBody: formData
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

var builder = Ares.instance.createComponent({kind: "OpenWebosBuild"});
ServiceRegistry.instance.pluginReady("openwebos", builder);