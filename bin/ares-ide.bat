@REM don't watch the sausage being made
@ECHO OFF

REM the folder this script is in
SET BIN_DIR=%~DP0

REM node script we are going to run
SET JS_SCRIPT=%BIN_DIR%\..\..\ide.js

REM path to included node
PATH=%BIN_DIR%..\node;%PATH%

REM use node to invoke js script with imported parameters
node.exe "%JS_SCRIPT%" -b %*