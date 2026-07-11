Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$path = 'C:\Users\65411\AppData\Local\Temp\xcomputer_main.png'
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "saved:$path size:$($bounds.Width)x$($bounds.Height)"
$graphics.Dispose()
$bitmap.Dispose()
