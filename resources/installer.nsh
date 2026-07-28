; Spire NSIS customizations (electron-builder include)
; Adds the MUI welcome page so the branded sidebar is visible on first open.

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
