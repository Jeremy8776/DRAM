Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\DataCert\dram-desktop"
WshShell.Run "npx electron .", 0, False
