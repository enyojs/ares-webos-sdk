### Demo

This is currently working on Mac OS X only.

####Download and extract the latest tarball from Jenkins####

[webos-sdk-commands-0.0.2.tgz](http://cloudhudson.palm.com/view/enyo/job/Enyo-package-ares-tools/lastSuccessfulBuild/artifact/webos-sdk-commands/webos-sdk-commands-0.0.2.tgz)


`$ tar -xzf webos-sdk-commands-0.0.2.tgz`


#### Set the PATH####


`$ export PATH=$PATH:<full-path-to-webos-sdk-commands-version>       ` 
	
####Generate a template app####


`$ cd <where-ever-you-want>`  
`$ ares-generate.sh -l`  
bootplate-2.1.1-owo	Enyo bootplate 2.1.1  
`$ ares-generate.sh -t bootplate-2.1.1-owo -p id=com.myapp -p title=MyApp MyApp`  
Generating bootplate-2.1.1-owo in /Users/ares/MyApp


####Package the template app####

`$ ares-package.sh MyApp`  
Minify-ing Enyo...  
Minify-ing the application...  
Success:  the deployable application is available in:  /Users/ares/MyApp/deploy/MyApp  
Packaging minified output: /Users/ares/MyApp/deploy/MyApp  
Creating package com.myapp_0.0.1_all.ipk in /Users/ares


####Install and launch the template app####

`$ ares-install.sh com.myapp_0.0.1_all.ipk  `  
installing ………………  
`$ ares-launch.sh com.myapp`  
launching ………… 

####Launch Ares in default Web browser####

`$ ares-ide.sh`  
ERRROR ……………….