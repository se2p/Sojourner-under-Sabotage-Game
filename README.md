# Sojourner under Sabotage - Game

This repository contains the Unity part of the serious game _Sojourner under Sabotage_. 
The Unity export is designed to be deployed as a part of the web application developed in the [Sojourner-under-Sabotage-Server](../../../Sojourner-under-Sabotage-Server) repository.

## Unity

This game was build with Unity 2022.3.0f1. Opening the project with other versions than Unity 2022 is not recommended.  
The correct Unity version can be downloaded best by adding this repository to your Unity Hub and opening it there. Only the WebGL build support is required. 

## Licensed Assets from the Asset Store

The game makes use of several packages and assets to improve the development workflow. Two of these assets are purchased from the Unity Asset Store:  

 - OneJS by DragonGround LLC (https://assetstore.unity.com/packages/tools/gui/onejs-221317)
 - RPG Map Editor by Creative Spore (https://assetstore.unity.com/packages/tools/game-toolkits/rpg-map-editor-25657)
 
These assets are not included in the public repository due to their licensing. 
To extend the game further and build the Unity export yourself, you need to purchase a proper license for the two packages and place them in the `Assets`-directory.

### Apply patches

For the RPG Map Editor to function properly for our use case, some project-specific changes need to be applied. To do this, run the following script to automatically apply the `ThirdParty\CreativeSpore\RpgMapEditor.patch` patch file. 

```cmd
Tools\apply_thirdparty_patches.cmd
```


## OneJS

To edit the Preact/TypeScript part of the game, the OneJS asset is used.  

 1. Open the `/OneJS` directory in Visual Studio Code. _Important:_ not the `/Assets/OneJS` folder, but the one in the repository root.
 2. Use `Ctrl + Shift + B` to start up the watch tasks (`tsc: watch`).
 3. Now all changed files of the OneJS part of the game are automatically recompiled and reloaded into Unity.

You can learn more about OneJS here: https://onejs.com/docs/
