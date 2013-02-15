### Demo

This is currently working on Mac OS X only.

####Download and extract the latest tarball from Jenkins####

[webos-sdk-commands-0.0.1.tgz](http://cloudhudson.palm.com/view/enyo/job/Enyo-package-ares-tools/lastSuccessfulBuild/artifact/webos-sdk-commands/webos-sdk-commands-0.0.1.tgz)

```bash
$ tar -xzf webos-sdk-commands-0.0.1.tgz
```
	
####Generate a template app####

```bash
$ cd webos-sdk-commands-0.0.1
$ ./ares-generate.sh -l
bootplate-2.1.1-owo	Enyo bootplate 2.1.1
$ ./ares-generate.sh -t bootplate-2.1.1-owo ../MyApp
generating bootplate-2.1.1-owo in /Users/andrewrich/Downloads/MyApp	
```

####Deploy/minify the template app####

```bash
$ ./ares-deploy.sh ../MyApp 
~/Downloads/MyApp ~/Downloads/webos-sdk-commands-0.0.1
enyo/tools/minify.sh args: 
Minify-ing Enyo...
Minify-ing the application...
Success:  the deployable application is available in:  /Users/andrewrich/Downloads/MyApp/deploy/MyApp
~/Downloads/webos-sdk-commands-0.0.1
```

####Package the template app####

```bash
$ ./ares-package.sh ../MyApp/deploy/MyApp
creating package com.yourdomain.enyo-app_0.0.1_all.ipk in /Users/andrewrich/Downloads/webos-sdk-commands-0.0.1
```

####Install and launch the template app####

(Assuming legacy Palm tools installed and a running emulator or connected device.)

```bash
$ palm-install com.yourdomain.enyo-app_0.0.1_all.ipk 
installing package com.yourdomain.enyo-app_0.0.1_all.ipk on device "emulator" {a8de72353f9a1b2e7fa075075d7ae1862db43cc6} tcp 51810
$ palm-launch com.yourdomain.enyo-app
launching application com.yourdomain.enyo-app on device "emulator" {a8de72353f9a1b2e7fa075075d7ae1862db43cc6} tcp 51810
```
