enyo.kind({
    name: "TargetConfiguration",
    kind: "FittableColumns",
    published: {
        devicesList: null,
        provider: null,
        isModified:false,
        newDeviceIndex:0
    },
    events:{
        onError:""
    },
    bindings: [
        {from: ".model.name", to: ".$.nameInput.value", oneWay:false},
        {from: ".model.description", to: ".$.descInput.value", oneWay:false},
        {from: ".model.host", to: ".$.ipInput.value", oneWay:false},
        {from: ".model.port", to: ".$.portInput.value", oneWay:false},
        {from: ".model.privateKey", to: ".$.keyCheckbox.checked"},
        {from: ".model.privateKeyName", to: ".$.privateKeyName.value"},
        {from: ".model.privateKey", to: ".$.deco_passphrase.showing"},
        {from: ".model.privateKey", to: ".$.title_passphrase.showing"},
        {from: ".model.privateKey", to: ".$.requestKeyButton.showing", transform: function(val) {return !val}, oneWay:false},
        {from: ".model.privateKey", to: ".$.deco_privateKey.showing",oneWay:false},
        {from: ".model.passphrase", to: ".$.passphrase.value", oneWay:false},
        {from: ".$.saveButton.disabled", to: ".$.requestKeyButton.disabled", transform: function(val) {return !val}, oneWay:false},
        {from: ".isModified", to: ".$.saveButton.disabled", transform: function(val) {return !val}},
        {from: ".isModified", to: ".$.modifiedContent.showing"}
    ],
    components: [           
        {kind: "FittableRows", fit:true,  components: [
            {kind: "onyx.Toolbar", components:[
                {tag:"span", content:"Target Device"},
                {name:"modifiedContent", tag:"span", content:" (modified)"},
                {kind:"onyx.Button", content:"Save", style:"float:right;", ontap:"save", name:"saveButton"},
                {kind:"onyx.Button", content:"Remove", style:"float:right;", ontap:"remove", name:"removeButton"},
                {kind:"onyx.Button", content:"Add", style:"float:right;", ontap:"add"}                
            ]},
            {kind:"FittableColumns", fit:true, components:[
                {kind: "enyo.Group",  fit:true, onActivate:"selectDevice", components:[
                    {kind: "enyo.DataList", name:"deviceList", components: [
                        {kind:"onyx.Button", style:"width:85%; margin:5px;", bindings:[
                            {from:".model.name", to:".name"}
                        ],
                        components: [
                            {tag:"span", content:"* ", bindings:[
                                {from:".model.modified", to:".showing"}
                            ]},
                            {tag:"span", bindings:[
                                {from:".model.name", to:".content"}
                            ]}
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
        this.devicesBackupData = enyo.clone(devicesData);
        this.devicesBackupData.lastselected = "webospro-qemux86"
        var defaultTarget = this.devicesBackupData.lastselected;
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.devices = new enyo.Collection(devicesData);
        this.$.deviceList.set("controller", this.devices);
        this.defaultTarget = this.findKindBy("name", defaultTarget); //set "WebOS Emulator " as default target
        if (this.defaultTarget) {
            this.defaultTarget.setActive(true);
            this.provider.setDevice(defaultTarget);
        }
    },

    selectDevice: function(inSender, inEvent) {
        if(inEvent.model){
            this.set("model", inEvent.model);
            this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
            this.provider.setDevice(inEvent.model.name);
        }
    },

    add: function(inSender, inEvent) {
        this.set("model", new enyo.Model({name:"new Devices"+this.newDeviceIndex, host:"127.0.0.1", port:"6622", description:"New Device", type:"starfish", privateKey:false, privateKeyName:"", passphrase:""}));
        this.model.set("modified", true);
        this.devices.add(this.model);
        this.setIsModified(true);
        this.targetDevice = this.findKindBy("name", "new Devices"+this.newDeviceIndex);
        this.targetDevice.setActive(true);
        this.newDeviceIndex++;
    },

    remove: function(inSender, inEvent) {
        this.devices.remove(this.model);
        this.set("model", this.devicesList[0]);
        this.targetDevice = this.findKindBy("name", this.model.name);
        this.targetDevice.setActive(true);
        this.setIsModified(true);
    },

    modified: function() {
        this.setIsModified(true);
        this.model.set("modified", true);
    },

    save: function() {
        var self = this;
        var devicesList = this.devices.raw();
        var devicesData = [];
        var deviceInfo = {};
        for(index in devicesList){
            for(key in devicesList[index]){
                if(devicesList[index][key]){
                    if(key === "privateKey" && devicesList[index]["privateKey"] == true){
                        deviceInfo.privateKey = {};
                        deviceInfo.privateKey.openSsh = devicesList[index]["privateKeyName"];
                    } else if (key !== "privateKeyName"){
                        deviceInfo[key] = devicesList[index][key];
                    }
                }
            }
            devicesData.push(deviceInfo);
            deviceInfo = {};
            this.devicesList[index].modified = false;
        }
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.provider['saveDevicesList'](devicesData, function(inError) {
            if(inError){
                self.doError({msg:"Cannot save the Devices Data"});
            } else {
                self.devicesBackupData = devicesList;
                self.devicesBackupData.lastselected = self.model.name;
                self.devices.data(self.devicesBackupData);
                self.targetDevice = self.findKindBy("name", self.devicesBackupData.lastselected);
                self.targetDevice.setActive(false);
                self.targetDevice.setActive(true);
                self.setIsModified(false);
            }
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
    },

    checkModified:function(){
        if (this.$.saveButton.disabled){
            this.devicesBackupData.lastselected = this.model.name;
            return false;
        }
        else {
            return true;
        }
    },
    revertData:function(){
        this.devices.data(this.devicesBackupData);
        this.targetDevice = this.findKindBy("name", this.devicesBackupData.lastselected);
        this.targetDevice.setActive(true);
        this.setIsModified(false);
    }
});
