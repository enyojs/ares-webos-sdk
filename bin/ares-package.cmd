:: Created by npm, please don't edit manually.
@SET SCRIPT="%~dp0\.\node_modules\ares-webos-sdk\bin\ares-package.js"

@IF NOT EXIST %SCRIPT% (
    @SET SCRIPT="%~dp0\.\ares-package.js"
) 

@IF EXIST "%~dp0\x86\node.exe" (
  "%~dp0\x86\node.exe"  %SCRIPT% %*
) ELSE (
  node  %SCRIPT% %*
)
