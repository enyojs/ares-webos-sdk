enyo.kind({
	name:"webOS.Centralization.list",
	kind:"FittableRows",
	published:{
		defaultUrl_centralization : "$enyo-framework/2.3.0-pre.8/"
	},
	components:[
			{name: "checkbox", kind: "onyx.Checkbox", onchange:"handleCentralization"},
			{tag: "label", name:"label", classes : "webos-fixed-label"},
			{name: "input", kind: "onyx.Input", classes:"webos-centralization-input", onchange:"valueChanged", showing:false}
	],
	events:{
		onCentralization:""
	},
	create:function(){
		this.inherited(arguments);
	},
	handleCentralization:function(inSender, inEvent){
		this.$.input.setShowing(inEvent.originator.checked);
		this.$.input.setValue(this.getDefaultUrl_centralization()+this.$.label.getContent());
		this.doCentralization({checked:inEvent.originator.checked, libName: this.$.label.getContent(), value:this.$.input.getValue()});
	},
	valueChanged:function(inSender, inEvent){
		this.doCentralization({checked:true, libName: this.$.label.getContent(), value:this.$.input.getValue()});
	}

});


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
		selectedWebosSvc: undefined,
		targetProject:""
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
		onChangeProjectStatus: "handleChangeProjectStatus",
		onCentralization: "handleCentralization"
	},
	components: [
		{kind:"enyo.Scroller", fit:"true", classes:"ares-project-properties",components:[
			{kind: "FittableRows", name:"webosPluginMain", components: [
				{classes:"ares-row ares-align-left", components :[
					{tag:"label", classess:"ares-fixed-label ares-small-label", content: "webos-service:"},
					{kind: "onyx.PickerDecorator", fit: true, components: [
						{name: "webosSvcButton", classes:"very-large-width", kind: "onyx.PickerButton", fit: true},
						{kind: "onyx.FlyweightPicker", name: "webosSvcPicker", components: [
							{name: "webosSvc"}
						], onSetupItem: "webosSvcSetupItem", onSelect: "webosSvcSelected"}
					]},
					{name: "add", kind: "onyx.Button", content: "Add", style: "margin-left:5px", ontap: "addService"}
				]},
				{classes:"ares-row ares-align-left", components :[
					{kind:"onyx.Groupbox", components:[
						{kind: "onyx.GroupboxHeader", fit:true, content: "Install Mode"},
						{kind:"Group",  onActivate:"checkMode", components:[
							{name:"InstalledCheckBox", kind:"onyx.Checkbox", value:"Installed"},
							{tag:"label", classes:"webos-label", content:"Installed"},
							{name:"HostedCheckBox", kind:"onyx.Checkbox", value:"Hosted"},
							{tag:"label", classes:"webos-label", content:"Hosted"}
						]}
					]}
				]}
			]}
		]},

		{kind: "Ares.ErrorPopup", name: "errorPopup", msg: "unknown error"}
	],

	webosSvcs: [],
	libsList: [],
	onDeviceSource: {},
	WEBOSSERVICE_NONE: "NONE",

	/**
	 * @private
	 */
	create: function() {
		this.inherited(arguments);
		this._initWebosSvcList();
		this.$.add.hide();
		this.createCentralizationHeaderComponent(false);
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
		this.setInstallMode();
		if (this.debug) this.log("config:", this.config);
	},
	/** public */
	getProjectConfig: function(config) {
		if (this.debug) this.log("config:", this.config);
		for(index in this.config){
			config[index] = this.config[index];
		}
	},
    /** public */
    saveProjectConfig: function(project) {
        if(project && this.config.enabled){
            this.updateAppInfo(project);
        }
        return true;
    },
    checkMode:function(inSender, inEvent){
    	this.config.installMode = inEvent.originator.value;
    },
    setInstallMode:function(){
    	if(!this.config.installMode){
    		this.config.installMode = "Installed";
    	}
    	this.$[this.config.installMode+"CheckBox"].setActive(true);
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
    	if(appInfoFile === undefined){
    		next(null, appInfoFile, null);
    	} else {
    		var req = project.getService().getFile(appInfoFile.id);
	    	req.response(this, function(inRequest, inData) {
	        	var data = JSON.parse(inData.content);
	        	next(null, appInfoFile, data);
	    	});
	    	req.error(this, this._handleServiceError.bind(this, "Unable to get appinfo.json data", next));
	    	req.go();	
    	}    	
    },
    /**
     * @private
     */
    _updateAppInfo: function(project, appInfoFile, appInfoData, next){
    	if(appInfoFile === undefined){
    		this.onDeviceSource={};
    		next();
    	} else {
    		var config = project.getConfig();
			appInfoData.id = config.data.id;
			appInfoData.version = config.data.version;
			appInfoData.title = config.data.title;
			if(Object.keys(this.onDeviceSource).length != 0){
				appInfoData.onDeviceSource = this.onDeviceSource;
			} else {
				delete appInfoData.onDeviceSource;
			}
			this.onDeviceSource={};
	    	var req = project.getService().putFile(appInfoFile.id, JSON.stringify(appInfoData, null, 2));
	    	req.response(this, function(inRequest, inData) {
	        	this.log("updateAppInfo#inData", inData);
	        	next();
	    	});
	    	req.error(this, this._handleServiceError.bind(this, "Unable to update appinfo.json file:", next));
	    	req.go();	
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
		this.initCentralization();
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


	/**
	 * @protected 
	 */
	initCentralization:function(){
		var self = this;
		this.$.webosPluginMain.$["centralization"].destroy();
		var project = this.targetProject;
		if(project !== ""){
			async.waterfall([
				this._getAppInfo.bind(this, project),
				this._getAppInfoData.bind(this, project),
				this._createCentralizationHeaderComponent.bind(this, project),
				this._createCentralizationComponent.bind(this, project)
			], function(err, results) {
				if (err) {
					self.$.errorPopup.raise(err.toString());
				}
			});	
		} else {
			this.createCentralizationHeaderComponent(false);
		}
		
        
	},
	_createCentralizationHeaderComponent:function(project, appInfoFile, appInfoData, next){
		this.createCentralizationHeaderComponent(true);
		next(null, appInfoFile, appInfoData);
	},
	_createCentralizationComponent:function(project, appInfoFile, appInfoData, next){
		var self = this;
		var config = project.getConfig();
		var req = config.service.propfind(config.folderId, 2);
		req.response(this, function(inSender, inFile) {
			enyo.forEach(inFile.children, function(v){
				if(v.isDir && v.name === 'lib'){
					for(index in v.children){
						var checked = false;
						var libName = "lib/"+v.children[index].name;
						if(appInfoData !== null && appInfoData.onDeviceSource !== undefined){							
							checked = appInfoData.onDeviceSource.hasOwnProperty(libName);
							self.onDeviceSource = appInfoData.onDeviceSource;
						}
						var libData = (checked ? appInfoData.onDeviceSource[libName]:"");
						self.setCentralization("libraries",libName, checked, libData);
					}
				}
			});
			checked = false;
			if(appInfoData !== null && appInfoData.onDeviceSource !== undefined){
				checked = appInfoData.onDeviceSource.hasOwnProperty("enyo");
			}
			libData = (checked ? appInfoData.onDeviceSource["enyo"]:"");
			self.setCentralization("enyocore", "enyo", checked, libData);
			self.render();
			next();
		});
		
	},
	createCentralizationHeaderComponent:function(isShowing){
		this.$.webosPluginMain.createComponent(
			{name:"centralization", kind: "onyx.Groupbox", showing: isShowing, components: [
				{kind: "onyx.GroupboxHeader", fit:true, content: "webOS Centralization"},
				{name: "centralization.enyocore", components:[
					{tag:"label", classes:"webos-label", content:"enyo"}
				]},
				{name: "centralization.libraries", components:[
					{tag:"label", classes:"webos-label", content:"Libraries"}
				]}
			]}
		);
	},

	/**
	 * @protected
	 */
	setCentralization:function(parent, lib, checked, libData){
		this.$.webosPluginMain.$["centralization."+parent].createComponent({name:"centralization."+lib, kind:"webOS.Centralization.list"});
		this.$.webosPluginMain.$["centralization."+parent].$["centralization."+ lib].$.label.setContent( $L(lib));
		this.$.webosPluginMain.$["centralization."+parent].$["centralization."+ lib].$.checkbox.setChecked(checked);
		this.$.webosPluginMain.$["centralization."+parent].$["centralization."+ lib].$.input.setShowing(checked);
		this.$.webosPluginMain.$["centralization."+parent].$["centralization."+ lib].$.input.setValue(libData);
	},

	handleCentralization:function(inSender, inEvent){
		if(inEvent.checked){
			this.onDeviceSource[inEvent.libName] = inEvent.value;
		} else {
			delete this.onDeviceSource[inEvent.libName];
		}
		return true;
	},

	statics: {
		getProvider: function() {
			this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
			return this.provider;
		}
	}
});

