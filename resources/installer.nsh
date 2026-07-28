; Spire NSIS — full custom wizard pages (electron-builder include)
; Page flow: Welcome → Directory → Options → InstFiles → Finish
;
; Custom pages use dialog 1044 (MUI welcome/finish surface), not 1018
; (small interior slot). Function bodies live inside the custom* macros
; so they compile after electron-builder’s common.nsh / plugins.

!include "${BUILD_RESOURCES_DIR}\nsis\theme.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

Var Spire.Dialog
Var Spire.Image
Var Spire.ImageHandle

!ifndef BUILD_UNINSTALLER
  Var Spire.DesktopCheck
  Var Spire.StartupCheck
  Var Spire.LaunchCheck
  Var Spire.OptionsPanel
  Var SpireDesktopShortcut
  Var SpireStartupApp
  Var SpireLaunchApp
!endif

; Match MUI welcome/finish “full window” mode (hide header/branding).
!macro Spire.LoadFullWindow
  LockWindow on
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1037
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1038
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1039
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${SW_SHOW}
  LockWindow off
!macroend

!macro Spire.UnloadFullWindow
  LockWindow on
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1037
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1038
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1039
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${SW_HIDE}
  LockWindow off
!macroend

!macro Spire.CreateFullPage IMAGE_FILE
  nsDialogs::Create 1044
  Pop $Spire.Dialog
  ${If} $Spire.Dialog == error
    Abort
  ${EndIf}
  SetCtlColors $Spire.Dialog "" 0x12161C
  ; Hero art on the upper area only — leave room for native checkboxes below
  ${NSD_CreateBitmap} 0 0 100% 118u ""
  Pop $Spire.Image
  ${NSD_SetStretchedImage} $Spire.Image "$PLUGINSDIR\${IMAGE_FILE}" $Spire.ImageHandle
!macroend

!macro customHeader
!macroend

!macro customInit
  InitPluginsDir
  StrCpy $SpireDesktopShortcut "1"
  StrCpy $SpireStartupApp "0"
  StrCpy $SpireLaunchApp "1"
  File /oname=$PLUGINSDIR\installerWelcome.bmp "${BUILD_RESOURCES_DIR}\installerWelcome.bmp"
  File /oname=$PLUGINSDIR\installerOptions.bmp "${BUILD_RESOURCES_DIR}\installerOptions.bmp"
  File /oname=$PLUGINSDIR\installerFinish.bmp "${BUILD_RESOURCES_DIR}\installerFinish.bmp"
!macroend

!macro customUnInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\installerUnwelcome.bmp "${BUILD_RESOURCES_DIR}\installerUnwelcome.bmp"
!macroend

!macro customWelcomePage
  Function Spire.Welcome.Create
    nsDialogs::Create 1044
    Pop $Spire.Dialog
    ${If} $Spire.Dialog == error
      Abort
    ${EndIf}
    SetCtlColors $Spire.Dialog "" 0x12161C
    ${NSD_CreateBitmap} 0 0 100% 100% ""
    Pop $Spire.Image
    ${NSD_SetStretchedImage} $Spire.Image $PLUGINSDIR\installerWelcome.bmp $Spire.ImageHandle
    !insertmacro Spire.LoadFullWindow
    nsDialogs::Show
    !insertmacro Spire.UnloadFullWindow
    ${NSD_FreeImage} $Spire.ImageHandle
  FunctionEnd

  Function Spire.Welcome.Leave
  FunctionEnd

  Page custom Spire.Welcome.Create Spire.Welcome.Leave
!macroend

!macro customPageAfterChangeDir
  Function Spire.Options.Create
    nsDialogs::Create 1044
    Pop $Spire.Dialog
    ${If} $Spire.Dialog == error
      Abort
    ${EndIf}
    SetCtlColors $Spire.Dialog "" 0x12161C

    ; Top hero only — control strip sits below
    ${NSD_CreateBitmap} 0 0 100% 100u ""
    Pop $Spire.Image
    ${NSD_SetStretchedImage} $Spire.Image "$PLUGINSDIR\installerOptions.bmp" $Spire.ImageHandle
    !insertmacro Spire.LoadFullWindow

    ; Light strip so native checkboxes paint correctly (SetCtlColors on
    ; BS_AUTOCHECKBOX is broken on modern Windows — leaves an empty panel).
    ${NSD_CreateLabel} 0 102u 100% 88u ""
    Pop $Spire.OptionsPanel
    SetCtlColors $Spire.OptionsPanel 0x1A222C 0xE4E9EF

    ${NSD_CreateLabel} 22u 110u 380u 12u "Optional — Start Menu shortcut is always created."
    Pop $0
    SetCtlColors $0 0x1A222C 0xE4E9EF

    ${NSD_CreateCheckbox} 22u 130u 380u 14u "Create a desktop shortcut"
    Pop $Spire.DesktopCheck
    ${If} $SpireDesktopShortcut == "1"
      ${NSD_Check} $Spire.DesktopCheck
    ${Else}
      ${NSD_Uncheck} $Spire.DesktopCheck
    ${EndIf}

    ${NSD_CreateCheckbox} 22u 152u 380u 14u "Start Spire when I sign in to Windows"
    Pop $Spire.StartupCheck
    ${If} $SpireStartupApp == "1"
      ${NSD_Check} $Spire.StartupCheck
    ${Else}
      ${NSD_Uncheck} $Spire.StartupCheck
    ${EndIf}

    ShowWindow $Spire.DesktopCheck ${SW_SHOW}
    ShowWindow $Spire.StartupCheck ${SW_SHOW}
    System::Call 'user32::SetWindowPos(i$Spire.DesktopCheck,i0,i0,i0,i0,i0,i0x13)'
    System::Call 'user32::SetWindowPos(i$Spire.StartupCheck,i0,i0,i0,i0,i0,i0x13)'

    nsDialogs::Show
    !insertmacro Spire.UnloadFullWindow
    ${NSD_FreeImage} $Spire.ImageHandle
  FunctionEnd

  Function Spire.Options.Leave
    ${NSD_GetState} $Spire.DesktopCheck $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SpireDesktopShortcut "1"
    ${Else}
      StrCpy $SpireDesktopShortcut "0"
    ${EndIf}

    ${NSD_GetState} $Spire.StartupCheck $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SpireStartupApp "1"
    ${Else}
      StrCpy $SpireStartupApp "0"
    ${EndIf}
  FunctionEnd

  Page custom Spire.Options.Create Spire.Options.Leave
!macroend

!macro customFinishPage
  Function Spire.Finish.Create
    nsDialogs::Create 1044
    Pop $Spire.Dialog
    ${If} $Spire.Dialog == error
      Abort
    ${EndIf}
    SetCtlColors $Spire.Dialog "" 0x12161C

    ${NSD_CreateBitmap} 0 0 100% 100u ""
    Pop $Spire.Image
    ${NSD_SetStretchedImage} $Spire.Image "$PLUGINSDIR\installerFinish.bmp" $Spire.ImageHandle
    !insertmacro Spire.LoadFullWindow

    GetDlgItem $0 $HWNDPARENT 3
    EnableWindow $0 0
    ShowWindow $0 ${SW_HIDE}

    ${NSD_CreateLabel} 0 102u 100% 56u ""
    Pop $Spire.OptionsPanel
    SetCtlColors $Spire.OptionsPanel 0x1A222C 0xE4E9EF

    ${NSD_CreateCheckbox} 22u 120u 380u 14u "Launch Spire"
    Pop $Spire.LaunchCheck
    ${If} $SpireLaunchApp == "1"
      ${NSD_Check} $Spire.LaunchCheck
    ${Else}
      ${NSD_Uncheck} $Spire.LaunchCheck
    ${EndIf}

    ShowWindow $Spire.LaunchCheck ${SW_SHOW}
    System::Call 'user32::SetWindowPos(i$Spire.LaunchCheck,i0,i0,i0,i0,i0,i0x13)'

    nsDialogs::Show
    !insertmacro Spire.UnloadFullWindow
    ${NSD_FreeImage} $Spire.ImageHandle
  FunctionEnd

  Function Spire.Finish.Leave
    ${NSD_GetState} $Spire.LaunchCheck $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SpireLaunchApp "1"
    ${Else}
      StrCpy $SpireLaunchApp "0"
    ${EndIf}

    ; Inline launch (avoid StartApp macro — it redeclares startAppArgs)
    ${If} $SpireLaunchApp == "1"
      ${If} ${isUpdated}
        StrCpy $R9 "--updated"
      ${Else}
        StrCpy $R9 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$R9"
    ${EndIf}
  FunctionEnd

  Page custom Spire.Finish.Create Spire.Finish.Leave
!macroend

!macro customUnWelcomePage
  Function un.Spire.UnWelcome.Create
    nsDialogs::Create 1044
    Pop $Spire.Dialog
    ${If} $Spire.Dialog == error
      Abort
    ${EndIf}
    SetCtlColors $Spire.Dialog "" 0x12161C
    ${NSD_CreateBitmap} 0 0 100% 100% ""
    Pop $Spire.Image
    ${NSD_SetStretchedImage} $Spire.Image $PLUGINSDIR\installerUnwelcome.bmp $Spire.ImageHandle
    !insertmacro Spire.LoadFullWindow
    nsDialogs::Show
    !insertmacro Spire.UnloadFullWindow
    ${NSD_FreeImage} $Spire.ImageHandle
  FunctionEnd

  Function un.Spire.UnWelcome.Leave
  FunctionEnd

  UninstPage custom un.Spire.UnWelcome.Create un.Spire.UnWelcome.Leave
!macroend

!macro customInstall
  ${If} $SpireDesktopShortcut == "0"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${If} $newDesktopLink != ""
      Delete "$newDesktopLink"
    ${EndIf}
  ${EndIf}

  ${If} $SpireStartupApp == "1"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Spire" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Spire"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Spire"
!macroend
