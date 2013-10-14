enyo.kind({
    name: "TargetConfiguration",
    kind: "FittableColumns",
    published: {
        devicesList: null,
        selectedTarget: null,
        selectedButton: null,
        provider: null,
        isModified:false
    },
    events:{
        onError:""
    },
    bindings:[
        {from: ".isModified", to:".$.saveButton.disabled", transform: function(val) {return !val}},
        {from: ".$.requestKeyButton.showing", to:".$.deco_privateKey.showing", oneWay:false, transform: function(val) {return !val}},
        {from: ".isModified", to: ".$.modifiedContent.showing"},
        {from: ".$.nameInput.value", to:".selectedButton.content"}
    ],
    components: [           
        {kind: "FittableRows", fit:true,  components: [
            {kind: "onyx.Toolbar", components:[
                {tag:"span", content:"Target Device"},
                {name:"modifiedContent", tag:"span", content:" (modified)"},
                {kind:"onyx.Button", content:"Save", style:"float:right;", ontap:"save", name:"saveButton"},
                {kind:"onyx.Button", content:"Remove", style:"float:right;", ontap:"remove", name:"removeButton"},
                {kind:"onyx.Button", content:"Add", style:"float:right;", ontap:"add", name:"addButton"}                
            ]},
            {kind:"FittableColumns", fit:true, components:[
                {kind: "enyo.Group", name:"deviceList", fit:true, onActivate:"selectDevice"},
                {kind:"enyo.Table", name:"selectedTable", oninput:"modified", components: [
                    {components: [
                        {content:"Name"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"nameInput", deviceData:"name"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"Description"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"descInput", deviceData:"description"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"IP Address"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"ipInput", deviceData:"host"}
                            ]}
                        ]}
                    ]},
                    {components: [
                        {content:"Port"},
                        {components: [
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"portInput", deviceData:"port"}
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
                    {name:"passphrase", components: [
                        {content:"Passphrase", name:"title_passphrase"},
                        {components: [
                            {kind:"onyx.InputDecorator", name:"deco_passphrase",components: [
                                {kind:"onyx.Input", name:"passphraseInput"}
                            ]}
                        ]}
                    ]}
                ]}
            ]}
            
        ]}
    ],
    
    create: function() {
        this.inherited(arguments);
        var self = this;
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.provider.loadDevicesList(function(inData) {
            var devices = enyo.json.parse(inData);
            self.setDevicesList(devices);
        });
    },

    rendered: function() {
        this.inherited(arguments);
        var devicesData = this.getDevicesList();
        this.sortDevice(devicesData);
        for(var index=0; index < devicesData.length; index++){
            this.$.deviceList.createComponent({kind:"TargetButton", keyData: devicesData[index].name});
        }
        this.$.deviceList.render();
        this.devicesBackupData = enyo.json.parse(enyo.json.stringify(this.devicesList));
        this.devicesBackupData.lastselected = "emulator"

        var defaultTarget = this.devicesBackupData.lastselected;

        this.defaultTarget = this.findTarget(defaultTarget); //set "WebOS Emulator " as default target
        if (this.defaultTarget) {
             this.defaultTarget.setActive(true);
             this.provider.setDevice(defaultTarget.name);
        }
    },

    sortDevice: function(devicesData) {

        function _orderByDeviceOrder(firstDevice, secondDevice) {
            return (Number(firstDevice.order) - Number(secondDevice.order));
        }
        devicesData.sort(_orderByDeviceOrder);
    },
    
    selectDevice: function(inSender, inEvent) {
        var deviceData = this.getDeviceData(inEvent.originator.keyData);
        if(deviceData){
            this.setSelectedTarget(deviceData);
            this.setSelectedButton(this.findTarget(inEvent.originator.keyData));
            this.$.nameInput.setValue(deviceData.name);
            this.$.descInput.setValue(deviceData.description);
            this.$.ipInput.setValue(deviceData.host);
            this.$.portInput.setValue(deviceData.port);
            if(deviceData.privateKey){
                this.$.privateKeyName.setValue(deviceData.privateKeyName);
                this.$.requestKeyButton.setShowing(false);
                this.$.passphrase.setShowing(true);
            } else{
                this.$.requestKeyButton.setShowing(true);
                this.$.passphrase.setShowing(false);
            }
            this.provider.setDevice(this.getSelectedTarget().name);
        }        
    },
    
    findMaxOrder: function(devicesList) {
        var devicesData = this.getDevicesList();
        var max = 0;
        for (idx in devicesData) {
            if (devicesData[idx].order >= max) {
                max = Number(devicesData[idx].order) + 1;
            }
        }
        return max;
    },

    add: function(inSender, inEvent) {
        var maxIndex = this.findMaxOrder(this.devicesList);
        var devicesData = this.getDevicesList();
        var newDevice = "new Device" + maxIndex;
        devicesData.push({order:maxIndex ,name: newDevice, description: newDevice + " description", 
            host:"127.0.0.1", port:"22", type:"starfish", username:"root", privateKey:false, privateKeyName:""});
        this.$.deviceList.createComponent({kind:"TargetButton", keyData: newDevice});
        this.$.deviceList.render();
        var target = this.findTarget(newDevice);
        if(target){
            target.setActive(true);
            this.provider.setDevice(target.keyData);
            this.getSelectedButton().dataChanged();
        }
        this.setIsModified(true);

        function _findMaxOrder(devicesList) {
            var max = 0;
            for (idx in devicesList) {
                if (devicesList[idx].order >= max) {
                    max = Number(devicesList[idx].order) + 1;
                }
            }
            return max;
        }
    },

    remove: function(inSender, inEvent) {
        var rmIdx = -1;
        var devicesData = this.getDevicesList();
        for (idx in devicesData){
            if (devicesData[idx].name === this.getSelectedTarget().name) {
                rmIdx = Number(idx);
                break;
            }
        }
        if (rmIdx === -1) {
            return;
        }
        var rmOrder = devicesData[rmIdx].order;
        devicesData.splice(rmIdx, 1);
        if (rmOrder) {
            for (idx in devicesData) {
                if (devicesData[idx].order > rmOrder) {
                    devicesData[idx].order--;
                }
            }
        }
        var target = this.findTarget(this.getSelectedTarget().name);
        if (target){
            target.destroy();
            target = this.findTarget(devicesData[0].name);
            target.setActive(true);
            this.provider.setDevice(target.keyData);   
        }
        this.setIsModified(true);  
    },

    modified: function(inSender, inEvent) {
        var targetButton = this.getSelectedButton();
        var deviceData = this.getDeviceData(this.selectedTarget.name);
        this.setIsModified(true);
        deviceData[inEvent.originator.deviceData] = inEvent.originator.value;
        if (inEvent.originator.name === "nameInput") {
            targetButton.targetNameChanged(inEvent.originator.value);
        } else {
            targetButton.dataChanged();    
        }
    },

    save: function() {
        var devicesList = this.getDevicesList();
        var devicesData = enyo.json.parse(enyo.json.stringify(devicesList));
        for (index in devicesData) {
            for (key in devicesData[index]) {
                if (key==="privateKey" && devicesData[index]["privateKey"] == true) {
                    devicesData[index]["privateKey"] = {};
                    devicesData[index]["privateKey"].openSsh = devicesData[index]["privateKeyName"];
                    if (devicesData[index]["privateKeyName"])
                        delete devicesData[index]["privateKeyName"];
                } else if (key === "privateKey" && devicesData[index]["privateKey"] == false) {
                    delete devicesData[index]["privateKey"];
                    if (devicesData[index]["privateKeyName"])
                        delete devicesData[index]["privateKeyName"];
                } else {
                    if (devicesData[index][key] === "")
                        delete devicesData[index][key];
                }
            }
        }
        var self = this;
        this.provider['saveDevicesList'](devicesData, function(inError) {
            if (inError){
                self.doError({msg:"Cannot save the Devices Data"});
            } else {
                self.devicesBackupData = enyo.json.parse(enyo.json.stringify(self.devicesList));
                self.devicesBackupData.lastselected = self.getSelectedTarget().name;
                self.setIsModified(false);
                for (index in self.$.deviceList.$){
                    self.$.deviceList.$[index].saved();
                }
            }
        });        
    },

    
    requestPrivateKey: function() {
        //FIXME : not implemented yet
        // var self = this;
        // self.provider = self.provider || ServiceRegistry.instance.resolveServiceId('webos');
        // self.provider['requestPrivateKey']({"device":this.model.name}, function(inError) {
        //     if(inError)
        //         self.doError({msg:"Cannot get the privateKey"});
        //     else {
        //         self.model.set("privateKey", true);
        //         self.model.set("privateKeyName", self.model.name +"_webos");
        //         self.model.set("passphrase", "webos");
        //         self.model.set("password", "lgsmarttvsdk");
        //         self.save();
        //     }
        // });   
    },

    findTarget: function(value) {
        for (index in this.$.deviceList.$)
            if (value === this.$.deviceList.$[index].getKeyData()) {
                return this.$.deviceList.$[index];
            }
    },

    getDeviceData:function(value) {
        for (i in this.devicesList) {
            if (this.devicesList[i].name === value)
                return this.devicesList[i];
        }
    },

    checkModified:function() {
        return this.getIsModified();
    },
    revertData:function() {
        var target;
        for (index in this.$.deviceList.$) {
            this.$.deviceList.$[index].destroy();
        }
        
        this.devicesList = {};
        this.devicesList = enyo.json.parse(enyo.json.stringify(this.devicesBackupData));
        delete this.devicesList.lastselected;

        for (var index=0; index < this.devicesBackupData.length; index++) {
            this.$.deviceList.createComponent({kind:"TargetButton", keyData: this.devicesBackupData[index].name});
        }
        this.$.deviceList.render();

        target = this.findTarget(this.devicesBackupData.lastselected);
        
        this.setSelectedButton(target);
        this.setSelectedTarget(this.getDeviceData(this.devicesBackupData.lastselected));
        target.setActive(true);
        this.setIsModified(false);
    }
});

enyo.kind({
    name: "TargetButton",
    kind: "onyx.Button",
    published:{
        targetName :"",
        keyData:""
    },
    style:"width:85%; margin:5px;", 
    components:[
        {tag:"span", name:"modified", content:"* ", showing:false},
        {tag:"span", name:"targetName"}
    ],
    create:function(){
        this.inherited(arguments);
        this.setTargetName(this.keyData);
    },
    setTargetName:function(value){
        this.$.targetName.setContent(value);
    },
    targetNameChanged:function(value){
        this.$.modified.setShowing(true);
        this.setTargetName(value);
    },
    saved:function(){
        this.$.modified.setShowing(false);
        this.setKeyData(this.$.targetName.content);
    },
    dataChanged:function(){
        this.$.modified.setShowing(true);
    }
});