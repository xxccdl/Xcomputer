Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

$results = @()
$callback = [WinAPI+EnumWindowsProc]{
    param($hwnd, $lParam)
    $sb = New-Object System.Text.StringBuilder(256)
    [WinAPI]::GetWindowText($hwnd, $sb, 256) | Out-Null
    $title = $sb.ToString()
    $visible = [WinAPI]::IsWindowVisible($hwnd)
    $r = New-Object WinAPI+RECT
    [WinAPI]::GetWindowRect($hwnd, [ref]$r) | Out-Null
    $w = $r.Right - $r.Left
    $h2 = $r.Bottom - $r.Top
    if ($w -ge 90 -and $w -le 130 -and $h2 -ge 90 -and $h2 -le 130 -and $visible) {
        $results += "HWND=$hwnd Title='$title' Visible=$visible Rect=$($r.Left),$($r.Top) ${w}x${h2}"
    }
    return $true
}
[WinAPI]::EnumWindows($callback, 0) | Out-Null
if ($results.Count -eq 0) {
    Write-Output "No visible 90-130px windows found"
} else {
    $results | ForEach-Object { Write-Output $_ }
}
