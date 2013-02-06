### Setup

There is not yet a packaged (installable) version.  You need to get the source, using the procedure below.

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

### Run

	$ ./palm-generate.js -l
	$ ./palm-generate.js -t bootplate-2.1.1-owo -p id=com.xxxx --debug -p version=1.2.3 ~/apps/new-app

	$ ./palm-package.js ~/GIT/TipCalc/deploy/TipCalc
