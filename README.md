# webOS SDK Command Line Tools

## Install

There is not yet a packaged (installable) version.  
You need to get the source, using the procedure below.

1. Clone the repository from GitHub

		$ git clone --recursive https://github.com/enyojs/webos-sdk-commands.git

2. Install the dependencies

		$ cd webos-sdk-commands
		$ npm install
		
## Path setting

The commands ares-* can be invoked from anywhere in the file system provided the PATH
has been set correctly.

On Linux and Mac OS X:

	$ export PATH=$PATH:<webos-sdk-commands-full-path>
	For exanple: export PATH=$PATH:/Users/ares/GIT/webos-sdk-commands
 
On windows (cmd.ex):

	> SET PATH=%PATH%;<webos-sdk-commands-full-path>
	For example: > SET PATH=%PATH%;C:\Users\ares\GIT\webos-sdk-commands
	
NOTE: On Windows, you can also use a bash enviromment.  
For example: [Git for Windows](http://code.google.com/p/msysgit/downloads/list?q=full+installer+official+git)) which provides a bash shell as on Linux.

## Usage

### ares-generate

	$ ares-generate.js -l
	$ ares-generate.js -t bootplate-2.1.1-owo -p id=com.myapp -p version=1.2.3 -p title=MyApp ../MyApp

### ares-package

	$ pushd ../MyApp
	$ chmod +x tools/deploy.sh
	$ ./tools/deploy.sh
	$ cp appinfo.json framework_config.json deploy/MyApp
	$ popd

	$ ares-package.js ../MyApp/deploy/MyApp

### ares-install
	
	$ ares-install --list
	$ ares-install --install com.myapp_1.0.0_all.ipk
	$ ares-install --remove com.myapp

`--install` is the default:

	$ ares-install com.myapp_1.0.0_all.ipk

## Caveats & Notes

### ares-package.js

* Currently uses the tar and ar commands provided by the operating system.  
Only tested on Mac OS X.
* The minification is done if possible
* The files appinfo.json and framework_config.json are automatically copied after the minification
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

When delivered as part of an SDK, ares-generate.js should refer to repositories brought on the local file system by the SDK.
	
This is not the case for the time being.   
ares-generate.js refers a ***temporary unofficial*** repository located at  [project-templates.json](https://raw.github.com/yves-del-medico/other-templates/master/project-templates.json).

	$ palm-package.js ../MyApp
	

### Run (without node installed)

If you do not have node installed but just have the binaries from e.g. [node-v0.8.19-darwin-x64.tar.gz](http://nodejs.org/dist/v0.8.19/node-v0.8.19-darwin-x64.tar.gz), you can still generate, deploy and package.

	$ export NODE_PATH=(path to downloaded node binary e.g. /Users/andrewrich/Downloads/node-v0.8.19-darwin-x64/bin)
	$ PATH=$PATH:$NODE_PATH node ares-generate.js -l
	$ PATH=$PATH:$NODE_PATH node ares-generate.js -t bootplate-2.1.1-owo -p id=com.myapp -p version=1.2.3 -p title=MyApp ../MyApp

	$ pushd ../MyApp
	$ PATH=$PATH:$NODE_PATH node enyo/tools/deploy.js
	$ cp appinfo.json framework_config.json deploy/MyApp
	$ popd

	$ PATH=$PATH:$NODE_PATH node ares-package.js ../MyApp/deploy/MyApp
	
