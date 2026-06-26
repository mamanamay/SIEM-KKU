$port_listen = 2222
$port_forward = 2223
$forward_ip = "127.0.0.1"

Write-Host "Starting Lightweight TCP Proxy Protocol Bridge..."
Write-Host "Listening on Port $port_listen, Forwarding to $forward_ip:$port_forward"

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port_listen)
$listener.Start()

while ($true) {
    if ($listener.Pending()) {
        $client = $listener.AcceptTcpClient()
        $remoteEndpoint = $client.Client.RemoteEndPoint -as [System.Net.IPEndPoint]
        $localEndpoint = $client.Client.LocalEndPoint -as [System.Net.IPEndPoint]
        
        $src_ip = $remoteEndpoint.Address.ToString()
        $src_port = $remoteEndpoint.Port
        $dst_ip = $localEndpoint.Address.ToString()
        $dst_port = $localEndpoint.Port

        Write-Host "Connection received from $src_ip : $src_port"

        # Create connection to Cowrie Docker
        $backend = [System.Net.Sockets.TcpClient]::new()
        try {
            $backend.Connect($forward_ip, $port_forward)
            
            $clientStream = $client.GetStream()
            $backendStream = $backend.GetStream()

            # Construct PROXY Protocol V1 Header
            # Format: PROXY TCP4 <src_ip> <dst_ip> <src_port> <dst_port>\r\n
            $proxy_header = "PROXY TCP4 $src_ip $dst_ip $src_port $dst_port`r`n"
            $header_bytes = [System.Text.Encoding]::ASCII.GetBytes($proxy_header)
            
            # Send Header to Backend
            $backendStream.Write($header_bytes, 0, $header_bytes.Length)

            # Bridge streams (Async)
            $clientStream.CopyToAsync($backendStream) | Out-Null
            $backendStream.CopyToAsync($clientStream) | Out-Null
            
        } catch {
            Write-Host "Failed to connect to Docker backend. Make sure it's running."
            $client.Close()
        }
    }
    Start-Sleep -Milliseconds 100
}
