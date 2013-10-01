/**
 * UI: Phonegap pane in the ProjectProperties popup
 * @name WebOS.ProjectProperties
 */

enyo.kind({
	name: "WebOS.ProjectProperties",
	kind: "Ares.ProjectProperties",
	debug: false,
	published: {
		config: {},
		selectedWebosSvc: undefined
	},
	events: {
		onConfigure: "",
		onApplyAddSource: "",
		onModifiedSource: "",
		onAddSource:"",
		onRemoveSource:"",
		onInitSource:""
	},
	handlers: {
		onChangeProjectStatus: "handleChangeProjectStatus"
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

	/**
	 * @private
	 */
	create: function() {
		this.inherited(arguments);
		this._initWebosSvcList();
		this.$.add.hide();
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
		this.setSelectedWebosSvc(undefined);
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
		if (inEvent.content === this.WEBOSSERVICE_NONE) {
			this.setSelectedWebosSvc(undefined);
		} else {
			this.setSelectedWebosSvc(inEvent.content);
		}
		this.doAddSource({source:this.selectedWebosSvc});
	},
	selectedWebosSvcChanged: function(inOldValue){
		this.doRemoveSource({source:inOldValue});
	},
	/** public */
	setProjectConfig: function(config) {
		this.config = config;
		if(!config.enabled){
			this.doInitSource();
		}
		if (this.debug) this.log("config:", this.config);
	},
	/** public */
	getProjectConfig: function() {
		if (this.debug) this.log("config:", this.config);
		return this.config;
	},
    /** public */
    saveProjectConfig: function(project) {
        if(project) {
            this.updateAppInfo(project);
        }
        return true;
    },
    updateAppInfo: function(project) {
        var self = this;
        async.waterfall([
            this._getAppInfo.bind(this, project),
            this._getAppInfoData.bind(this, project),
            this._updateAppInfo.bind(this, project)
        ], function(err, results) {
            if (err) {
                self.$.errorPopup.raise(err.toString());
            }
        });
    },
    /**
     * @private
     */
    _getAppInfo: function(project, next) {
        var req = project.getService().propfind(project.getFolderId(), 1);
        req.response(this, function(inRequest, inData) {
            var appInfoFile = enyo.filter(inData.children, function(child) {
                return child.name === 'appinfo.json';
            }, this)[0];
            next(null, appInfoFile);
        });
        req.error(this, this._handleServiceError.bind(this, "Unable to list project root folder", next));
        req.go();
    },
    /**
     * @private
     */
    _getAppInfoData: function(project, appInfoFile, next) {
      var req = project.getService().getFile(appInfoFile.id);
      req.response(this, function(inRequest, inData) {
        var data = JSON.parse(inData.content);
        next(null, appInfoFile, data);
      });
      req.error(this, this._handleServiceError.bind(this, "Unable to get appinfo.json data", next));
      req.go();
    },
    /**
     * @private
     */
    _updateAppInfo: function(project, appInfoFile, appInfoData, next) {
      var config = project.getConfig();
      appInfoData.id = config.data.id;
      appInfoData.version = config.data.version;
      appInfoData.title = config.data.title;
      var req = project.getService().putFile(appInfoFile.id, JSON.stringify(appInfoData, null, 2));
      req.response(this, function(inRequest, inData) {
        this.log("updateAppInfo#inData", inData);
        next();
      });
      req.error(this, this._handleServiceError.bind(this, "Unable to update appinfo.json file:", next));
      req.go();
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
		});
		
		req.error(this, function(inSender, inError) {
			this.log("Unable to get the service files (" + inError + ")");
			this.$.errorPopup.raise('Unable to instanciate service content from the source');
		});
		return true;
	},
	/**
	 * @protected
	 */	
	handleChangeProjectStatus: function (inSender, inEvent){
		if (inEvent.status === "modify") {
			this.$.add.show();
		} else {
			this.$.add.hide();
		}
		this.$.webosSvcPicker.setSelected(0);
		this.setSelectedWebosSvc(undefined);
		this.doAddSource({source:this.selectedWebosSvc});
		return true;
	},
	statics: {
		getProvider: function() {
			this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
			return this.provider;
		}
	}
});

