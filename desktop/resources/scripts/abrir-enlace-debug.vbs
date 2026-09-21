' Script silencioso para el protocolo llamadita:// (sin ventana de consola negra)
Set objArgs = WScript.Arguments
If objArgs.Count > 0 Then
    url = objArgs(0)
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set wshShell = CreateObject("WScript.Shell")
    
    ' 1. Guardar en TEMP para que la app abierta lo recoja de inmediato
    tempDir = wshShell.ExpandEnvironmentStrings("%TEMP%")
    Set file1 = fso.CreateTextFile(tempDir & "\llamadita_enlace.txt", True)
    file1.WriteLine url
    file1.Close
    
    ' 2. Guardar en .tmp local de la app
    appDir = fso.GetParentFolderName(WScript.ScriptFullName)
    tmpDir = appDir & "\.tmp"
    If Not fso.FolderExists(tmpDir) Then fso.CreateFolder(tmpDir)
    Set file2 = fso.CreateTextFile(tmpDir & "\enlace.txt", True)
    file2.WriteLine url
    file2.Close

    ' 3. Si la app no está abierta, abrirla sin duplicar procesos
    Set wmi = GetObject("winmgmts:")
    Set procs = wmi.ExecQuery("Select * from Win32_Process where Name = 'Llamadita-win_x64.exe' or Name = 'Llamadita.exe'")
    If procs.Count = 0 Then
        exeWin = appDir & "\Llamadita-win_x64.exe"
        exeNorm = appDir & "\Llamadita.exe"
        If fso.FileExists(exeWin) Then
            wshShell.Run """" & exeWin & """", 1, False
        ElseIf fso.FileExists(exeNorm) Then
            wshShell.Run """" & exeNorm & """", 1, False
        End If
    End If
End If
