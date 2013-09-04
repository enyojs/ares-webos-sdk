enyo.kind({
    name: "TargetConfiguration",
    kind: "FittableColumns",
    published: {
        devicesList: null,
        provider: null
    },
    events:{
        onError:""
    },
    bindings: [
        {from: ".model.name", to: ".$.nameInput.value", twoWay:true},
        {from: ".model.description", to: ".$.descInput.value", twoWay:true},
        {from: ".model.host", to: ".$.ipInput.value", twoWay:true},
        {from: ".model.port", to: ".$.portInput.value", twoWay:true},
        {from: ".model.privateKey", to: ".$.keyCheckbox.checked"},
        {from: ".model.privateKeyName", to: ".$.privateKeyName.value"},
        {from: ".model.privateKey", to: ".$.deco_passphrase.showing"},
        {from: ".model.privateKey", to: ".$.title_passphrase.showing"},
        {from: ".model.privateKey", to: ".$.requestKeyButton.showing", transform: function(val) {return !val}, twoWay:true},
        {from: ".model.privateKey", to: ".$.deco_privateKey.showing",twoWay:true},
        {from: ".model.passphrase", to: ".$.passphrase.value", twoWay:true},
        {from: ".$.saveButton.disabled", to: ".$.requestKeyButton.disabled", transform: function(val) {return !val}, twoWay:true},
        {from: ".model.modified", to: ".$.saveButton.disabled", transform: function(val) {return !val}}
    ],
    components: [           
        {kind: "FittableRows", fit:true,  components: [
            {kind: "onyx.Toolbar", components:[
                {content: "Target Device"},
                {kind:"onyx.Button", content:"Save", style:"float:right;", ontap:"save", name:"saveButton"},
                {kind:"onyx.Button", content:"Remove", style:"float:right;", ontap:"remove", name:"removeButton"},
                {kind:"onyx.Button", content:"Add", style:"float:right;", ontap:"add"}                
            ]},
            {kind:"FittableColumns", fit:true, components:[
                {kind: "enyo.Group",  fit:true, onActivate:"selectDevice", components:[
                    {kind: "enyo.DataList", name:"deviceList", components: [
                        {kind:"onyx.Button", style:"width:85%; margin:5px;", bindFrom:"name", bindTo:"name", components: [
                            {tag:"span", content:"* ", bindFrom:"modified", bindTo:"showing"},
                            {tag:"span", bindFrom:"name"}
                        ]}                    
                    ]}
                ]},
                {kind:"enyo.Table", name:"selectedTable", oninput:"modified", components: [
                    {components: [
                        {content:"Name"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"nameInput"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"Description"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"descInput"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"IP Address"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"ipInput"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"Port"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"portInput"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"Private Key"},
                        {components: [
                            {kind:"onyx.InputDecorator", name:"deco_privateKey",components: [
                                {kind:"onyx.Input", name:"privateKeyName", disabled:true},
                                
                            ]},
                            {kind:"onyx.Button", name:"requestKeyButton", ontap:"requestPrivateKey", content:"Request Private Key"}
                        ]}
                    ]},
                    {components: [
                        {content:"Passphrase", name:"title_passphrase"},
                        {components: [
                            {kind:"onyx.InputDecorator", name:"deco_passphrase",components: [
                                {kind:"onyx.Input", name:"passphrase"}
                            ]}
                        ]}
                    ]}
                ]}
            ]}
            
        ]}
    ],

    rendered: function() {
        this.inherited(arguments);
        //Get the Devices List from novacom-device.json
        var devicesData = this.getDevicesList();
        var defaultTarget = "webospro-qemux86";
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.devices = new enyo.Collection(devicesData);
        this.$.deviceList.set("controller", this.devices);
        this.defaultTarget = this.findKindBy("name", defaultTarget); //set "WebOS Emulator " as default target
        if (this.defaultTarget) {
            this.defaultTarget.setActive(true);
        }
        this.provider.setDevice(defaultTarget);
    },

    selectDevice: function(inSender, inEvent) {
        if(inEvent.model){
            this.set("model", inEvent.model);
            this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
            this.provider.setDevice(inEvent.model.name);
        }
    },

    add: function(inSender, inEvent) {
        this.set("model", new enyo.Model({name:"new Devices", host:"127.0.0.1", port:"6622", description:"New Device", type:"starfish", privateKey:false, privateKeyName:"", passphrase:""}));
        this.model.set("modified", true);
        this.devices.add(this.model);
        this.targetDevice = this.devices.__store[this.devices.length-1];
        this.targetDevice = this.targetDevice._dispatchTargets[this.targetDevice._dispatchTargets.length-1];
        this.targetDevice.setActive(true);
    },

    remove: function(inSender, inEvent) {
        this.devices.remove(this.model);
        this.set("model", this.devicesList[0]);
        this.defaultTarget.setActive(true);
        this.save();
    },

    modified: function() {
        this.model.set("modified", true);
    },

    save: function() {
        //TODO: Request privateKey from keyserver, then set on model
        //this.model.set("privateKey", {openSsh:"todo"});
        var self = this;
        var devicesData = [];
        var deviceInfo = {};
        var attributeKeys;
        this.model.set("modified", false);
        for(index in this.devicesList){
            attributeKeys = this.devicesList[index].__attributeKeys;
            if(!this.devicesList[index].modified){
                for(Key in attributeKeys){
                    attributeKey = attributeKeys[Key];
                    if(attributeKey === "privateKey"){
                        deviceInfo.privateKey = {};
                        deviceInfo.privateKey.openSsh = this.devicesList[index]["privateKeyName"];
                    } else if(attributeKey !== "privateKeyName") {
                        deviceInfo[attributeKey] = this.devicesList[index][attributeKey];
                    }
                    if(!this.devicesList[index][attributeKey]){
                        delete deviceInfo[attributeKey];
                    }
                }
                devicesData.push(deviceInfo);
            }
            deviceInfo = {};
        }
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.provider['saveDevicesList'](devicesData, function(inError) {
            if(inError)
                self.doError({msg:"Cannot save the Devices Data"});
        });        
    },

    requestPrivateKey: function() {
        var self = this;
        self.provider = self.provider || ServiceRegistry.instance.resolveServiceId('webos');
        self.provider['requestPrivateKey']({"device":this.model.name}, function(inError) {
            if(inError)
                self.doError({msg:"Cannot get the privateKey"});
            else {
                self.model.set("privateKey", true);
                self.model.set("privateKeyName", self.model.name +"_webos");
                self.model.set("passphrase", "webos");
                self.model.set("password", "lgsmarttvsdk");
                self.save();
            }
        });   
    },

    findKindBy: function(index, value){
        for(i in this.$){
            if(this.$[i][index] === value)
                return this.$[i];
        }
    }
});
