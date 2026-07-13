# Upload installer to GitHub release using .NET HttpWebRequest (streaming, no timeout)
$ErrorActionPreference = 'Stop'

# Get GitHub token
$credOutput = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
$ghToken = ($credOutput | Select-String "^password=").ToString().Replace("password=", "").Trim()

$installerPath = "d:\code\DAFWorkspace\dist-release-v5\Xcomputer-0.2.56-setup.exe"
$fileName = "Xcomputer-0.2.56-setup.exe"
$uploadUrl = "https://uploads.github.com/repos/xxccdl/Xcomputer/releases/352769192/assets?name=$fileName"

Write-Output "Starting streaming upload of $([math]::Round((Get-Item $installerPath).Length/1MB, 2)) MB..."
Write-Output "URL: $uploadUrl"

# Create HttpWebRequest with infinite timeout
$webRequest = [System.Net.HttpWebRequest]::Create($uploadUrl)
$webRequest.Method = "POST"
$webRequest.Headers.Add("Authorization", "token $ghToken")
$webRequest.Accept = "application/vnd.github+json"
$webRequest.ContentType = "application/octet-stream"
$webRequest.Timeout = [System.Threading.Timeout]::Infinite
$webRequest.ReadWriteTimeout = [System.Threading.Timeout]::Infinite
$webRequest.AllowWriteStreamBuffering = $false
$webRequest.SendChunked = $false

# Open file stream and set content length
$fileStream = [System.IO.File]::OpenRead($installerPath)
$webRequest.ContentLength = $fileStream.Length
Write-Output "Content-Length: $($fileStream.Length) bytes"

# Stream the file in 80KB chunks
$requestStream = $webRequest.GetRequestStream()
$buffer = New-Object byte[] 81920
$totalBytes = 0
$lastProgress = 0
while (($bytesRead = $fileStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $requestStream.Write($buffer, 0, $bytesRead)
    $totalBytes += $bytesRead
    $progress = [math]::Floor($totalBytes * 100 / $fileStream.Length)
    if ($progress -ge $lastProgress + 10) {
        Write-Output "Progress: $progress% ($([math]::Round($totalBytes/1MB, 1)) MB / $([math]::Round($fileStream.Length/1MB, 1)) MB)"
        $lastProgress = $progress
    }
}
$requestStream.Close()
$fileStream.Close()
Write-Output "Upload complete, waiting for response..."

# Read response
try {
    $response = $webRequest.GetResponse()
    $responseStream = New-Object System.IO.StreamReader($response.GetResponseStream())
    $responseBody = $responseStream.ReadToEnd()
    $responseStream.Close()
    $response.Close()
    Write-Output "SUCCESS: $responseBody"
} catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if ($response) {
        $responseStream = New-Object System.IO.StreamReader($response.GetResponseStream())
        $errorBody = $responseStream.ReadToEnd()
        $responseStream.Close()
        $response.Close()
        Write-Output "ERROR (HTTP $($response.StatusCode)): $errorBody"
    } else {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
}
