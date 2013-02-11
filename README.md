### Setup

There is not yet a packaged (installable) version.  
You need to get the source, using the procedure below.

####Clone the repository from GitHub####
Using git, clone the repository using either the HTTPS or SSH urls (depending on how you have setup Git):

	$ git clone --recursive https://github.com/enyojs/webos-sdk-commands.git

or

	$ git clone --recursive git@github.com:enyojs/webos-sdk-commands.git

####Install the dependencies

	$ cd webos-sdk-commands
	$ cd node_modules/nodejs-module-webos-ipk
	$ npm install .
	$ cd ../..
	$ npm install .

### Warnings

Concerning palm-package.js:  

* Currently uses the tar and ar commands provided by the operating system.  
Only tested on Mac OS X.
* Minification of the project MUST be done manually.
* Copying appinfo.json and framework_config.json in the minification result is also manual.  
***NOTE:*** This should probably added in the deploy.sh of enyo
* The generated ipk is installable but the app will not start as bootplate.zip does not bring the line   
	"window.PalmSystem && window.PalmSystem.stageReady();"  
in the index.html.  
***NOTE:*** Several solutions (with no order regarding feasibility, …):  
	* The .zip file brougth by the sdk should inlude that line.  
	  What about project created in Ares from the original bootplate.zip ?
	* It might be possible to inlude this line thank to the substitutions available in [nodejs-module-webos-ipkg](https://github.com/enyojs/nodejs-module-webos-ipkg)
	* This line could be included into enyo
	* Leave that to the user

### Repositories

When delivered as part of an SDK, palm-generate.js should refer to repositories brought on the local file system by the SDK.
	
This is not the case for the time being.   
palm-generate.js refers a ***temporary unofficial*** repository located at  [project-templates.json](https://raw.github.com/yves-del-medico/other-templates/master/project-templates.json).

### Run

	$ palm-generate.js -l
	$ palm-generate.js -t bootplate-2.1.1-owo -p id=com.myapp -p version=1.2.3 -p title=MyApp .../MyApp

	$ cd .../MyApp
	$ tools/deploy.sh
	$ cp appinfo.json framework_config.json deploy/MyApp

	$ palm-package.js deploy/MyApp
