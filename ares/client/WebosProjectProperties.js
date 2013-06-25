/**
 * UI: Phonegap pane in the ProjectProperties popup
 * @name WebOS.ProjectProperties
 */

enyo.kind({
	name: "WebOS.ProjectProperties",
	kind: "Ares.ProjectProperties",
	debug: false,
	published: {
		config: {}
	},
	events: {
		onConfigure: "",
		onApplyAddSource: "",
		onModifiedSource: ""
	},
	handlers: {
		onModifiedConfig: "createProject" ,
	},
	components: [
		{kind:"enyo.Scroller", fit:"true", classes:"ares-project-properties",components:[
			{kind: "FittableRows", components: [
				{classes:"ares-row ares-align-left", components :[
					{tag:"label", classess:"ares-fixed-label ares-small-label", content: "webos-service:"},
					{kind: "onyx.PickerDecorator", fit: true, components: [
						{name: "webosSvcButton", classes:"very-large-width", kind: "onyx.PickerButton", fit: true},
						{kind: "onyx.FlyweightPicker", name: "webosSvcPicker", components: [
							{name: "webosSvc"}
						], onSetupItem: "webosSvcSetupItem", onSelect: "webosSvcSelected"}
					]},
					{name: "add", kind: "onyx.Button", content: "Add", style: "margin-left:5px", ontap: "addService"}
				]}
			]}
		]},

		{kind: "Ares.ErrorPopup", name: "errorPopup", msg: "unknown error"}
	],

	webosSvcs: [],
	WEBOSSERVICE_NONE: "NONE",
	selectedWebosSvc: undefined,

	/**
	 * @private
	 */
	create: function() {
		this.inherited(arguments);
		this._initWebosSvcList();
	},
	/**
	 * @private
	 */
	setWebosSvcList: function(webosSvcs) {
		this.webosSvcs = [this.WEBOSSERVICE_NONE];
		enyo.forEach(webosSvcs, function(item) {
			this.webosSvcs.push(item.id);
		}, this);
		this.$.webosSvcPicker.setCount(this.webosSvcs.length);
		this.$.webosSvcPicker.setSelected(0);
		this.selectedWebosSvc = undefined;
	},
	_initWebosSvcList: function() {
		var service = ServiceRegistry.instance.getServicesByType('generate')[0];
		if (service) {
			var webosSvcReq = service.getSources('webosService');
			webosSvcReq.response(this, function(inSender, inWebosSvcs) {
				this.setWebosSvcList(inWebosSvcs);
			});
			webosSvcReq.error(this, function(inSender, inError) {
				this.$.errorPopup.raise('Unable to get webos service list');
			});
		} else {
			this.log('Unalbe to get webos service list (No service defined)');
			this.$.errorPopup.raise('Unable to get webos service list (No service defined)');
			this.setWebosSvcList([]);
		}
	},
	/**
	 * @private
	 */
	webosSvcSetupItem: function(inSender, inEvent) {
		if (this.debug) this.log("sender:", inSender, "value:", inValue);
		this.$.webosSvc.setContent(this.webosSvcs[inEvent.index]);
		return true;
	},
	/**
	 * @private
	 */
	webosSvcSelected: function(inSender, inEvent) {
		if (inEvent.content === this.WEBOSSEVICE_NONE) {
			this.selectedWebosSvc = undefined;
		} else {
			this.selectedWebosSvc = inEvent.content;
		}

		this.doApplyAddSource({source:this.selectedWebosSvc});
	},
	/** public */
	setProjectConfig: function(config) {
		this.config = config;
		if (this.debug) this.log("config:", this.config);
		this.config.enabled = true;
	},
	/** public */
	getProjectConfig: function() {
		if (this.debug) this.log("config:", this.config);
		return this.config;
	},
	/**
	 * @protected
	 */
	addService: function (inSender, inEvent){
		//var genService = ServiceRegistry.instance.getServicesByType('generate')[0];
		if (this.selectedWebosSvc === undefined) {
			return;
		}
		var genService = ServiceRegistry.instance.resolveServiceId('genZip');
		var req = genService.generate({
			sourceIds: [this.selectedWebosSvc],
			substitutions: []
		});
		
		req.response(this, function(inSender, inData) {
			this.doModifiedSource(inData);
			this.bubble("onProjectSelected");
		});
		
		req.error(this, function(inSender, inError) {
			this.log("Unable to get the service files (" + inError + ")");
			this.$.errorPopup.raise('Unable to instanciate service content from the source');
		});

	},

	statics: {
		getProvider: function() {
			this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
			return this.provider;
		}
	}
});

