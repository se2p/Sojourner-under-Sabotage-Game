@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0.."
set "PATCH=%REPO_ROOT%\ThirdParty\CreativeSpore\RpgMapEditor.patch"
set "PLUGIN_ROOT=%REPO_ROOT%\Assets\CreativeSpore"
set "FOLLOW_OBJECT=%PLUGIN_ROOT%\RpgMapEditor\Scripts\Extra\FollowObjectBehaviour.cs"
set "PATH_FINDING=%PLUGIN_ROOT%\RpgMapEditor\Scripts\MapPathFinding\MapPathFindingBehaviour.cs"
set "PLAYER_CONTROLLER=%PLUGIN_ROOT%\RpgMapEditor\Scripts\RpgFramework\Controllers\PlayerController.cs"

pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Repository root could not be found.
    exit /b 1
)

if not exist "%PATCH%" (
    echo ERROR: Patch not found: "%PATCH%"
    popd
    exit /b 1
)

if not exist "%PLUGIN_ROOT%\." (
    echo ERROR: CreativeSpore plugin is missing.
    echo Install the licensed plugin into "Assets\CreativeSpore" first.
    popd
    exit /b 1
)

findstr /C:"SnapToTarget" "%FOLLOW_OBJECT%" >nul 2>&1
if errorlevel 1 goto apply_patch
findstr /C:"StopCoroutine" "%PATH_FINDING%" >nul 2>&1
if errorlevel 1 goto apply_patch
findstr /C:"EnableAttack" "%PLAYER_CONTROLLER%" >nul 2>&1
if errorlevel 1 goto apply_patch

echo CreativeSpore patch is already applied.
popd
exit /b 0

:apply_patch
echo Checking CreativeSpore patch compatibility...
git apply --check --unidiff-zero --whitespace=nowarn -- "%PATCH%"
if errorlevel 1 (
    echo ERROR: Patch does not match the installed plugin version.
    popd
    exit /b 1
)

git apply --unidiff-zero --whitespace=nowarn -- "%PATCH%"
if errorlevel 1 (
    echo ERROR: Could not apply the CreativeSpore patch.
    popd
    exit /b 1
)

echo CreativeSpore patch applied successfully.
popd
exit /b 0
