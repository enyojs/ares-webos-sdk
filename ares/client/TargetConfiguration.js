enyo.kind({
    name: "TargetConfiguration",
    kind: "FittableColumns",
    published: {
        devicesList: null,
        provider: null
    },
    bindings: [
        {from: ".model.name", to: ".$.nameInput.value", twoWay:true},
        {from: ".model.description", to: ".$.descInput.value", twoWay:true},
        {from: ".model.host", to: ".$.ipInput.value", twoWay:true},
        {from: ".model.port", to: ".$.portInput.value", twoWay:true},
        {from: ".model.privateKey", to: ".$.keyCheckbox.checked"},
        {from: ".model.privateKeyName", to: ".$.privateKeyName.value"},
        {from: ".model.privateKey", to: ".$.reqButton.content"},
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
                            {kind:"onyx.InputDecorator", components: [
                                {kind:"onyx.Input", name:"privateKeyName", disabled:true}
                            ]},
                            {kind:"onyx.Checkbox", name:"keyCheckbox", onActivate:"requestPrivateKey"}
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
        this.devices = new enyo.Collection(devicesData);
        this.$.deviceList.set("controller", this.devices);
        this.defaultTarget = this.findKindBy("name", "webospro-qemux86"); //set "WebOS Emulator " as default target
        this.defaultTarget.setActive(true);
    },

    selectDevice: function(inSender, inEvent) {
        if(inEvent.model){
            this.set("model", inEvent.model);
            this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
            this.provider.setDevice(inEvent.model.name);
        }
    },

    add: function(inSender, inEvent) {
        this.set("model", new enyo.Model({name:"new Devices", host:"127.0.0.1", port:"6622", description:"New Device", type:"starfish"}));
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
                }
                devicesData.push(deviceInfo);
            }
            deviceInfo = {};
        }
        this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
        this.provider['saveDevicesList'](devicesData, function(inError) {
            if(inError)
                console.log("error"); // TODO : Error handling 
        });        
    },

    findKindBy: function(index, value){
        for(i in this.$){
            if(this.$[i][index] === value)
                return this.$[i];
        }
    }
});