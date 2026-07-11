Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

$h = [WinAPI]::FindWindow($null, 'Xcomputer-FloatingBall')
Write-Output "HWND: $h"
if ($h -ne 0) {
    $visible = [WinAPI]::IsWindowVisible($h)
    $r = New-Object WinAPI+RECT
    [WinAPI]::GetWindowRect($h, [ref]$r) | Out-Null
    $w = $r.Right - $r.Left
    $h2 = $r.Bottom - $r.Top
    Write-Output "Visible: $visible"
    Write-Output "Position: $($r.Left), $($r.Top)"
    Write-Output "Size: ${w}x${h2}"
}
