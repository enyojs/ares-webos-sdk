enyo.kind({
	name: "OpenWebosBuild",
	kind: "enyo.Component",
	create: function() {
		this.log("CREATE OpenWebosBuild plugin object");
	},
	setConfig: function(config) {
		this.config = config;
		this.log(config);

		if (this.config.origin && this.config.pathname) {
			this.url = this.config.origin + this.config.pathname;
			if (this.debug) this.log("url:", this.url);
		}
	},
	build: function(project, next) {
		this.log("Starting OWO build: " + this.url + '/build');
		var req = new enyo.Ajax({
			url: this.url + '/build',
			method: 'POST'
		});
		req.response(this, function(inSender, inData) {
			if (this.debug) this.log("OWO build successful");
			next();
		});
		req.error(this, function(inSender, inError) {
			if (this.debug) this.error("Unable to start an OWO OpenWebosBuild", "response:", response);
			next(new Error("Unable to start an OWO OpenWebosBuild"));
		});
		req.go();
	}
});

ServiceRegistry.instance.pluginReady("openwebos", new OpenWebosBuild());