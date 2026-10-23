; MokomailBrowser — установщик NSIS.
;
; При установке новой сборки убираем данные предыдущей версии, чтобы браузер
; открывался «как впервые»: с первоначальной настройкой, без истории и сессии.
; Затрагивается только папка данных в профиле пользователя собранной программы.

!macro customInstall
  DetailPrint "Очистка данных предыдущей сборки MokomailBrowser..."
  RMDir /r "$APPDATA\MokomailBrowser"

  ; Пересоздаём ярлыки с явным путём к иконке exe. Это лечит старые ярлыки,
  ; у которых в IconLocation остался относительный/битый путь и не было значка.
  Delete "$newDesktopLink"
  Delete "$newStartMenuLink"
  CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
