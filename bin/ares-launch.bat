@REM don't watch the sausage being made
@ECHO OFF

REM the folder this script is in (*/bootplate/tools)
SET ARES_DIR=%~DP0

REM node script we are going to run
SET JS_SCRIPT=%ARES_DIR%\lib\ares-launch.js

REM node location
SET NODE=node.exe

REM use node to invoke js script with imported parameters
%NODE% "%JS_SCRIPT%" %*
