:: Created by npm, please don't edit manually.
@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\.\node_modules\nodejs-module-webos-ipkg\bin\ares-package.js" %*
) ELSE (
  node  "%~dp0\.\node_modules\nodejs-module-webos-ipkg\bin\ares-package.js" %*
)